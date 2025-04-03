import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Estimate salary using OpenAI API based on job description with streaming response
async function estimateSalaryStream(jobData: any, signal: AbortSignal): Promise<ReadableStream> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable not set");
  }

  // Prepare a concise prompt with the most relevant information
  const prompt = `
    Below is a JSON representation of a job posting. Based on the provided information, estimate the annual salary range in USD:
    
    ${JSON.stringify(jobData)}
    
    Provide the estimated salary range, confidence level, and provide thorough reasoning behind your decision.
    If anything in the provided JSON does not seem related to a valid job posting, completely ignore it. Only consider things that make sense in the context of a job posting.
  `;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: `
                You are a compensation expert who estimates salary ranges for job postings. Provide salary ranges in USD with a confidence level (low, medium, high).
                Format your response in via the following:
                <SALARY_RANGE> ;;
                <CONFIDENCE_LEVEL> ;;
                <REASONING>
            `
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: true // Enable streaming
      }),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    // Create a TransformStream to process OpenAI's streaming format
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        
        // Skip [DONE] messages
        if (text.includes('data: [DONE]')) {
          return;
        }
        
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          try {
            const jsonStr = line.slice(6); // Remove "data: " prefix
            const parsedData = JSON.parse(jsonStr);
            
            // Check if we have content in the delta
            if (parsedData.choices && 
                parsedData.choices[0] && 
                parsedData.choices[0].delta && 
                parsedData.choices[0].delta.content) {
              // Send the actual content as SSE
              controller.enqueue(
                new TextEncoder().encode(`data: ${parsedData.choices[0].delta.content}\n\n`)
              );
            }
          } catch (error) {
            // If JSON parsing fails, log the error but continue
            console.error("Error parsing OpenAI response:", error);
          }
        }
      }
    });

    // Return the transformed stream
    return response.body.pipeThrough(transformStream);
  } catch (error) {
    // Create a stream that sends an error message
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
        controller.close();
      }
    });
    return readable;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { jobData } = await req.json();
    
    if (!jobData) {
      return new Response(
        JSON.stringify({ error: "Job data is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create an AbortController to handle client disconnections
    const abortController = new AbortController();

    // Get the stream from OpenAI
    const openAIStream = await estimateSalaryStream(jobData, abortController.signal);

    // Return the stream directly
    return new Response(openAIStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});