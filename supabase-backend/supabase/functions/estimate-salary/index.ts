import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  

// Estimate salary using OpenAI API based on job description
async function estimateSalary(jobData: any) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable not set");
  }

  try {
    // Prepare a concise prompt with the most relevant information
    const prompt = `
      Below is a JSON representation of a job posting. Based on the provided information, estimate the annual salary range in USD:
      
      ${JSON.stringify(jobData)}
      
      Provide the estimated salary range, confidence level, and provide thorough reasoning behind your decision.
      If anything in the provided JSON does not seem related to a valid job posting, completely ignore it. Only consider things that make senes in the context of a job posting.
    `;

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
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return JSON.parse(result.choices[0].message.content);
  } catch (error) {
    throw new Error(`Failed to estimate salary: ${error.message}`);
  }
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    const { jobData } = await req.json();
    
    if (!jobData) {
      return new Response(
        JSON.stringify({ error: "Job data is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const salaryEstimate = await estimateSalary(jobData);
    
    return new Response(
      JSON.stringify({ success: true, data: salaryEstimate }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});