import React, { useState, useEffect } from 'react';
import { getToken } from '../../services/api';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import { useAlert } from '../../contexts/AlertContext';
import {
  DocumentTextIcon,
  MagnifyingGlassIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

const Notes = ({ embedded = false } = {}) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ category: '', entity_id: '', q: '', date_from: '', date_to: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const { showError } = useAlert();

  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  // loadNotes accepts an optional explicit page to avoid race conditions with setState
  const loadNotes = async (resetPage = false, pageOverride = null) => {
    setLoading(true);
    try {
      const token = getToken();
      const currentPage = pageOverride !== null ? pageOverride : (resetPage ? 1 : pagination.page);
      const params = new URLSearchParams({ page: currentPage, limit: pagination.limit, ...filters });

      const res = await fetch(`${apiBase}/notes?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch notes');

      const data = await res.json();
  setNotes(data.notes || []);
  setPagination(prev => ({ ...prev, page: data.page || currentPage, total: data.total || 0, pages: data.pages || 0 }));
  if (resetPage) setPagination(prev => ({ ...prev, page: 1 }));
    } catch (err) {
      console.error('Load notes error', err);
      showError('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNotes(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleFilterChange = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const applyFilters = () => loadNotes(true);
  const resetFilters = () => { setFilters({ category: '', entity_id: '', q: '', date_from: '', date_to: '' }); setPagination(prev => ({ ...prev, page: 1 })); loadNotes(true); };
  const changePage = (p) => { 
    // load specific page directly to avoid relying on async state update
    loadNotes(false, p);
  };

  return (
    <div className="space-y-6">
      {/* Header (omit when embedded) */}
      {!embedded && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <DocumentTextIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Free Text Notes</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Notes imported from the on-disk CSV. Use filters to narrow results.</p>
              </div>
            </div>
            {!loading && pagination.total > 0 && (
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{pagination.total.toLocaleString()}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Notes</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={filters.q}
            onChange={(e) => { handleFilterChange('q', e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search notes text..."
          />

        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            value={filters.category}
            onChange={(e) => { handleFilterChange('category', e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Types</option>
            <option value="rsvp">RSVP</option>
            <option value="helpdesk">Helpdesk</option>
            <option value="maintenance">Maintenance</option>
            <option value="feedback">Feedback</option>
            <option value="incident">Incident</option>
          </select>

          <input
            placeholder="Entity ID"
            value={filters.entity_id}
            onChange={(e) => { handleFilterChange('entity_id', e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />

          <input type="date" value={filters.date_from} onChange={(e) => { handleFilterChange('date_from', e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }} className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />

          <input type="date" value={filters.date_to} onChange={(e) => { handleFilterChange('date_to', e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }} className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />

        </div>

        <div className="mt-4 flex items-center space-x-2">
          <button onClick={applyFilters} className="px-4 py-2 bg-blue-600 text-white rounded-md flex items-center"><MagnifyingGlassIcon className="w-4 h-4 mr-2" />Search</button>
          <button onClick={resetFilters} className="px-4 py-2 border rounded-md flex items-center"><FunnelIcon className="w-4 h-4 mr-2" />Reset</button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        {loading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Text</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {notes.map(note => (
                    <tr key={note.note_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-white">{note.note_id}</td>
                      <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-300">{note.entity_id}</td>
                      <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-300">{note.category}</td>
                      <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-300 max-w-xl truncate">{note.text}</td>
                      <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-300">{new Date(note.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-900">Showing page {pagination.page} of {pagination.pages} ({pagination.total} notes)</div>
                <div className="flex space-x-1">
                  <button disabled={pagination.page === 1} onClick={() => changePage(pagination.page - 1)} className="px-3 py-2 border rounded-md text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">Previous</button>
                  {[...Array(Math.min(5, pagination.pages))].map((_, i) => {
                    const pageNum = Math.max(1, pagination.page - 2) + i;
                    if (pageNum > pagination.pages) return null;
                    return (
                      <button key={pageNum} onClick={() => changePage(pageNum)} className={`px-3 py-2 border rounded-md ${pageNum === pagination.page ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'}`}>{pageNum}</button>
                    );
                  })}
                  <button disabled={pagination.page === pagination.pages} onClick={() => changePage(pagination.page + 1)} className="px-3 py-2 border rounded-md text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">Next</button>
                </div>
              </div>
            )}

            {!notes.length && (
              <div className="text-center py-8 text-sm text-gray-500">No notes found. Try adjusting filters.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Notes;
