'use client';

import React, { useState, useEffect } from 'react';

// Replace this with your Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-jKRb58vwoCWuSUrdHOxhEkMjAEp5hbMxNGtmSevR442bs9f_opzK0ONTBnmjlFHy3Q/exec';

export default function Dashboard() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    if (APPS_SCRIPT_URL.includes('PASTE_YOUR')) {
      setLoading(false);
      setError('Please configure your Google Apps Script URL in page.tsx');
      return;
    }

    try {
      // Fetch from our Next.js backend proxy to bypass browser CORS restrictions
      const response = await fetch('/api/leads', {
        method: 'GET',
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data && data.error) {
         throw new Error(data.error);
      }
      
      // Sort by newest first assuming Date is the first column and parsable
      if (Array.isArray(data)) {
        data.reverse();
        setLeads(data);
      } else {
        console.warn("Expected array but got:", data);
        setLeads([]);
      }
      setLoading(false);
    } catch (err: any) {
      console.error("Fetch error details:", err);
      setError(`Failed to fetch leads: ${err.message}. Please ensure your Apps Script is deployed with "Who has access" set to "Anyone".`);
      setLoading(false);
    }
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = 
      (lead['Business Name']?.toLowerCase() || '').includes(search.toLowerCase()) || 
      (lead['Address']?.toLowerCase() || '').includes(search.toLowerCase());
      
    const matchesStatus = statusFilter === 'All' || lead['Status'] === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const renderRating = (ratingStr: string) => {
    if (!ratingStr || ratingStr === 'N/A' || ratingStr === '0') {
      return <span className="text-gray-500 text-sm">N/A</span>;
    }
    
    const rating = parseFloat(ratingStr);
    let colorClass = 'bg-gray-800 text-gray-300';
    if (rating >= 4.5) colorClass = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    else if (rating >= 4.0) colorClass = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    else if (rating < 3.5) colorClass = 'bg-red-500/20 text-red-400 border border-red-500/30';

    return (
      <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${colorClass}`}>
        <span>{rating.toFixed(1)}</span>
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      </div>
    );
  };

  const renderStatus = (status: string) => {
    let colorClass = 'bg-gray-800 text-gray-300 border-gray-700';
    if (status === 'New') colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (status === 'Contacted') colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (status === 'Converted') colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (status === 'Rejected') colorClass = 'bg-red-500/10 text-red-400 border-red-500/20';

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded border ${colorClass}`}>
        {status || 'New'}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-200 font-sans selection:bg-blue-500/30 p-6 md:p-12">
      
      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/5 pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Proventure Digital
          </h1>
          <p className="text-slate-400 mt-1">Lead Management SaaS Dashboard</p>
        </div>
        
        <div className="mt-4 md:mt-0 flex gap-4">
          <button onClick={fetchLeads} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Refresh Data
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input 
            type="text" 
            placeholder="Search by Name or Address..." 
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder-slate-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex-shrink-0">
          <select 
            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10 text-slate-200"
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All" className="bg-slate-900">All Statuses</option>
            <option value="New" className="bg-slate-900">New</option>
            <option value="Contacted" className="bg-slate-900">Contacted</option>
            <option value="Converted" className="bg-slate-900">Converted</option>
            <option value="Rejected" className="bg-slate-900">Rejected</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {error ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          <div>
            <h3 className="font-semibold">Connection Error</h3>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p>Syncing with Google Sheets database...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-10 text-center text-slate-400">
          <p>No leads found in the database. Run your Python script to populate Google Sheets!</p>
        </div>
      ) : (
        <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden shadow-2xl backdrop-blur-sm">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/[0.04] border-b border-white/10 text-slate-300 font-semibold">
                <tr>
                  <th className="px-6 py-4">Date Added</th>
                  <th className="px-6 py-4">Business Name</th>
                  <th className="px-6 py-4">Rating</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Website</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLeads.map((lead, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4 text-slate-400">
                      {formatDate(lead['Date'])}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-200">{lead['Business Name']}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[250px] mt-1" title={lead['Address']}>{lead['Address']}</div>
                    </td>
                    <td className="px-6 py-4">
                      {renderRating(lead['Rating'])}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-300 font-medium">{lead['Phone'] !== 'No Number' ? lead['Phone'] : <span className="text-slate-600">N/A</span>}</div>
                    </td>
                    <td className="px-6 py-4">
                      {lead['Website'] !== 'No Website' && lead['Website'] ? (
                        <a href={lead['Website']} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1">
                          Visit Site
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        </a>
                      ) : (
                        <span className="text-slate-600">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {renderStatus(lead['Status'])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredLeads.length === 0 && (
            <div className="p-10 text-center text-slate-500">
              No leads match your current search and filter criteria.
            </div>
          )}
          <div className="bg-white/[0.02] border-t border-white/5 px-6 py-3 text-xs text-slate-500 flex justify-between">
            <span>Showing {filteredLeads.length} of {leads.length} leads</span>
            <span>Connected to Google Sheets API</span>
          </div>
        </div>
      )}
    </div>
  );
}
