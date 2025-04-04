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
    If anything in the provided JSON does not seem related to a valid job posting, completely ignore it. Only consider things that make senes in the context of a job posting.
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
            content: "You are a compensation expert who estimates salary ranges for job postings. Provide salary ranges in USD with a confidence level (low, medium, high). Format as JSON with 'salaryRange', 'confidenceLevel', and 'reasoning' fields."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        stream: true // Enable streaming
      }),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    return response.body!;
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

    // Transform the OpenAI stream format to SSE format
    const transformStream = new TransformStream({
      transform: (chunk, controller) => {
        const text = new TextDecoder().decode(chunk);
        
        // OpenAI sends "data: [DONE]" to indicate the end of the stream
        if (text.includes('data: [DONE]')) {
          return;
        }
        
        // Process each line
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          // Skip any line that doesn't start with "data: "
          if (!line.startsWith('data: ')) continue;
          
          try {
            // Extract the JSON content
            const jsonContent = line.slice(6); // Remove "data: " prefix
            const parsedData = JSON.parse(jsonContent);
            
            // Get the actual content if it exists
            if (parsedData.choices && parsedData.choices[0].delta && parsedData.choices[0].delta.content) {
              controller.enqueue(new TextEncoder().encode(`data: ${parsedData.choices[0].delta.content}\n\n`));
            }
          } catch (error) {
            // If parsing fails, pass through the original content
            controller.enqueue(new TextEncoder().encode(`data: ${line.slice(6)}\n\n`));
          }
        }
      }
    });

    // Pipe the OpenAI stream through our transformer
    const sseStream = openAIStream.pipeThrough(transformStream);

    // Return a streaming response
    return new Response(sseStream, {
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