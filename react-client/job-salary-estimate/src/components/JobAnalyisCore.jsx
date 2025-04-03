import React, { useState, useEffect } from 'react';
import { Loader2, Search, DollarSign, Briefcase, MapPin, Building, Calendar, CheckCircle, AlertCircle } from 'lucide-react';

const JobAnalysisApp = () => {
  const [url, setUrl] = useState('');
  const [jobData, setJobData] = useState(null);
  const [salaryEstimate, setSalaryEstimate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [streamingData, setStreamingData] = useState('');
  const [error, setError] = useState('');

  // Effect to parse streaming data into structured salary estimate
  useEffect(() => {
    if (!streamingData) return;
    
    // Split the streamed data into parts using the ';;' delimiter
    const parts = streamingData.split(';;').map(part => part.trim());
    
    if (parts.length >= 2) {
      setSalaryEstimate({
        salaryRange: parts[0],
        confidenceLevel: parts[1],
        reasoning: parts.length >= 3 ? parts[2] : '',
      });
    }
  }, [streamingData]);

  // Extract job data from URL
  const extractJobData = async () => {
    setIsLoading(true);
    setIsEstimating(false);
    setSalaryEstimate(null);
    setStreamingData('');
    setError('');
    try {
      const response = await fetch('https://mzmgtykgdhbawgvnltqi.supabase.co/functions/v1/extract-job-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to extract job data');
      }
      
      const result = await response.json();
      setJobData(result.data);
    } catch (err) {
      setError(err.message);
      setJobData(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Estimate salary from job data with streaming support
  const estimateSalary = async () => {
    if (!jobData) return;
    
    setIsEstimating(true);
    setSalaryEstimate(null);
    setStreamingData('');
    setError('');
    
    try {
      const response = await fetch('https://mzmgtykgdhbawgvnltqi.supabase.co/functions/v1/estimate-salary-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobData }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to estimate salary');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          setIsEstimating(false);
          break;
        }
        
        const text = decoder.decode(value);
        // Parse SSE format: each message starts with "data: "
        const lines = text.split('\n')
          .filter(line => line.startsWith('data: '))
          .map(line => line.substring(6));
          
        lines.forEach(line => {
          setStreamingData(prev => prev + line);
        });
      }
    } catch (err) {
      setError(err.message);
      setIsEstimating(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    extractJobData();
  };

  // Render a loading/streaming state for the salary estimation
  const renderStreamingState = () => {
    if (!streamingData) {
      return <p className="text-gray-600 italic">Analyzing job data...</p>;
    }
    
    // Split the streamed data to show what we have so far
    const parts = streamingData.split(';;').map(part => part.trim());
    
    return (
      <div>
        {parts[0] && (
          <div className="mb-2">
            <span className="font-bold">Salary Range:</span> {parts[0]}
          </div>
        )}
        
        {parts[1] && (
          <div className="mb-2">
            <span className="font-bold">Confidence Level:</span> {parts[1]}
          </div>
        )}
        
        {parts[2] && (
          <div>
            <span className="font-bold">Analysis:</span>
            <div className="whitespace-pre-line">{parts[2]}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
      <header className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Job Posting Analyzer</h1>
        <p className="text-gray-600">Extract job details and estimate salary ranges</p>
      </header>
      
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-2">
          <div className="relative flex-grow">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste job posting URL here"
              className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <span className="absolute left-3 top-3.5 text-gray-400">
              <Search size={18} />
            </span>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg flex items-center gap-2 disabled:bg-blue-400"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Analyze'}
          </button>
        </div>
      </form>
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        </div>
      )}
      
      {jobData && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold text-gray-800">{jobData.title || 'Job Title'}</h2>
              {!isEstimating && !salaryEstimate && (
                <button
                  onClick={estimateSalary}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md flex items-center gap-2"
                >
                  <DollarSign size={16} />
                  Estimate Salary
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap gap-4 mb-6 text-gray-600">
              {jobData.company && (
                <div className="flex items-center gap-1">
                  <Building size={16} />
                  <span>{jobData.company}</span>
                </div>
              )}
              {jobData.location && (
                <div className="flex items-center gap-1">
                  <MapPin size={16} />
                  <span>{typeof jobData.location === 'string' ? jobData.location : 
                    [jobData.location.city, jobData.location.state, jobData.location.country]
                      .filter(Boolean).join(', ')}</span>
                </div>
              )}
              {jobData.employmentType && (
                <div className="flex items-center gap-1">
                  <Briefcase size={16} />
                  <span>{jobData.employmentType}</span>
                </div>
              )}
              {jobData.postedDate && (
                <div className="flex items-center gap-1">
                  <Calendar size={16} />
                  <span>Posted: {jobData.postedDate}</span>
                </div>
              )}
            </div>
            
            {isEstimating && (
              <div className="mb-6 p-4 bg-green-50 border rounded-md">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-green-800 mb-4">
                  <div className="flex items-center gap-2">
                    <Loader2 size={18} className="animate-spin" />
                    <span>Estimating Salary...</span>
                  </div>
                </h3>
                {renderStreamingState()}
              </div>
            )}
            
            {!isEstimating && salaryEstimate && (
              <div className="mb-6 p-4 bg-green-50 border rounded-md">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-green-800 mb-2">
                  <DollarSign />
                  Estimated Salary
                </h3>
                <p className="text-xl font-bold text-green-700 mb-2">
                  {salaryEstimate.salaryRange}
                </p>
                <div className="mb-6 flex items-center gap-1 text-green-600">
                  <CheckCircle size={16} />
                  <span>Confidence Level: {salaryEstimate.confidenceLevel}</span>
                </div>
                <div className="p-4 bg-blue-50 border rounded-md">
                  <h3 className="text-lg font-semibold mb-2">Salary Analysis</h3>
                  <div className="text-gray-700 whitespace-pre-line">
                    {salaryEstimate.reasoning}
                  </div>
                </div>
              </div>
            )}
            
            {jobData.description && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Job Description</h3>
                <div className="text-gray-700 prose max-w-none">
                  {jobData.description}
                </div>
              </div>
            )}
            
            {jobData.requirements && jobData.requirements.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Requirements</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  {Array.isArray(jobData.requirements) ? 
                    jobData.requirements.map((req, i) => <li key={i}>{req}</li>) :
                    <li>{jobData.requirements}</li>
                  }
                </ul>
              </div>
            )}
            
            {jobData.benefits && jobData.benefits.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Benefits</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  {Array.isArray(jobData.benefits) ? 
                    jobData.benefits.map((benefit, i) => <li key={i}>{benefit}</li>) :
                    <li>{jobData.benefits}</li>
                  }
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobAnalysisApp;