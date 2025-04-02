import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fetch structured data from job posting using Firecrawl API
async function extractJobData(url: string) {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  
  if (!FIRECRAWL_API_KEY) {
    throw new Error("FIRECRAWL_API_KEY environment variable not set");
  }

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url: url,
        formats: [
          "json"
        ],
        onlyMainContent: true,
        jsonOptions: {
          schema: jobSchema
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to extract job data: ${error.message}`);
  }
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    const { url } = await req.json();
    
    if (!url) {
      return new Response(
        JSON.stringify({ error: "Job posting URL is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const jobData = await extractJobData(url);
    
    return new Response(
      JSON.stringify({ success: true, data: jobData.data.json }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

const jobSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Job Posting Schema",
  "description": "Schema for standardized job posting data",
  "type": "object",
  "required": ["title", "company", "location", "description"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier for the job posting"
    },
    "title": {
      "type": "string",
      "description": "Job title"
    },
    "company": {
      "type": "string",
      "description": "Company offering the position"
    },
    "location": {
      "type": "object",
      "description": "Job location details",
      "properties": {
        "city": { "type": "string" },
        "state": { "type": "string" },
        "country": { "type": "string" },
        "postalCode": { "type": "string" },
        "remote": { "type": "boolean" },
        "hybrid": { "type": "boolean" }
      }
    },
    "description": {
      "type": "string",
      "description": "Full job description"
    },
    "employmentType": {
      "type": "string",
      "enum": ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP", "VOLUNTEER"],
      "description": "Type of employment"
    },
    "salary": {
      "type": "object",
      "properties": {
        "minimum": { "type": "number" },
        "maximum": { "type": "number" },
        "currency": { "type": "string", "default": "USD" },
        "period": { 
          "type": "string", 
          "enum": ["HOUR", "DAY", "WEEK", "MONTH", "YEAR"]
        },
        "isEstimate": { "type": "boolean" }
      }
    },
    "requirements": {
      "type": "object",
      "properties": {
        "education": {
          "type": "array",
          "items": { "type": "string" }
        },
        "experience": {
          "type": "array",
          "items": { "type": "string" }
        },
        "skills": {
          "type": "array",
          "items": { "type": "string" }
        },
        "certifications": {
          "type": "array",
          "items": { "type": "string" }
        },
        "languages": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "language": { "type": "string" },
              "proficiency": { "type": "string" }
            }
          }
        }
      }
    },
    "benefits": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of benefits offered"
    },
    "applicationDetails": {
      "type": "object",
      "properties": {
        "deadline": { 
          "type": "string", 
          "format": "date-time" 
        },
        "instructions": { "type": "string" },
        "url": { "type": "string", "format": "uri" },
        "email": { "type": "string", "format": "email" },
        "phone": { "type": "string" }
      }
    },
    "postedDate": {
      "type": "string",
      "format": "date-time",
      "description": "When the job was posted"
    },
    "validThrough": {
      "type": "string",
      "format": "date-time",
      "description": "Expiration date of the job posting"
    },
    "department": {
      "type": "string",
      "description": "Department or team within the company"
    },
    "hiringManager": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "title": { "type": "string" },
        "email": { "type": "string", "format": "email" }
      }
    },
    "industry": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Industries associated with the job"
    },
    "jobFunction": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Job functions or categories"
    },
    "source": {
      "type": "object",
      "properties": {
        "site": { "type": "string" },
        "url": { "type": "string", "format": "uri" },
        "scrapedDate": { "type": "string", "format": "date-time" }
      },
      "description": "Source of the job posting data"
    }
  }
}