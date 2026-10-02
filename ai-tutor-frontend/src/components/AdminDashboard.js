import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://127.0.0.1:8000/api';

export default function AdminDashboard({ user, token, onLogout }) {
  const [stats, setStats] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals State
  const [selectedUserDetails, setSelectedUserDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Enable vertical body scrolling while Admin Dashboard is mounted
  useEffect(() => {
    const origBodyOverflow = document.body.style.overflow;
    const origHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    return () => {
      document.body.style.overflow = origBodyOverflow;
      document.documentElement.style.overflow = origHtmlOverflow;
    };
  }, []);

  const authHeader = useCallback(() => {
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, [token]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/admin/stats`, { headers: authHeader() }),
        fetch(`${API_BASE}/admin/users`, { headers: authHeader() })
      ]);

      if (statsRes.status === 403 || usersRes.status === 403) {
        throw new Error('Access denied. Administrator privileges required.');
      }

      if (!statsRes.ok || !usersRes.ok) {
        throw new Error('Failed to load administrator data from server.');
      }

      const statsData = await statsRes.json();
      const usersData = await usersRes.json();

      setStats(statsData);
      setUsersList(usersData);
    } catch (err) {
      setError(err.message || 'An error occurred while fetching admin data.');
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open User Details Modal
  const handleViewDetails = async (targetUser) => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${targetUser.id}/details`, {
        headers: authHeader()
      });
      if (!res.ok) {
        const errData = await res.json();
        alert(errData.detail || 'Failed to fetch user details');
        return;
      }
      const data = await res.json();
      setSelectedUserDetails(data);
    } catch (err) {
      alert('Error loading user details: ' + err.message);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Execute User Deletion
  const handleConfirmDelete = async () => {
    if (!deleteConfirmUser) return;
    setActionInProgress(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${deleteConfirmUser.id}`, {
        method: 'DELETE',
        headers: authHeader()
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || 'Failed to delete user');
      } else {
        setDeleteConfirmUser(null);
        fetchData();
      }
    } catch (err) {
      alert('Error deleting user: ' + err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  // Filter Users
  const filteredUsers = usersList.filter(u => {
    const matchesSearch =
      (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter.toLowerCase();
    return matchesSearch && matchesRole;
  });

  if (error && error.includes('Access denied')) {
    return (
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#0a0a0a',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        zIndex: 9999
      }}>
        <div style={{
          padding: '12px 20px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          color: '#f87171',
          marginBottom: '20px',
          fontWeight: 'bold',
          fontSize: '16px'
        }}>
          Access Denied
        </div>
        <p style={{ color: '#cccccc', maxWidth: '420px', marginBottom: '24px', fontSize: '14px', lineHeight: '1.6' }}>
          You do not have administrator permissions to access this dashboard.
        </p>
        <button
          onClick={onLogout}
          style={{
            backgroundColor: 'orange',
            color: '#111111',
            border: 'none',
            borderRadius: '6px',
            padding: '12px 24px',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      backgroundColor: '#0a0a0a',
      color: '#ffffff',
      fontFamily: "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      boxSizing: 'border-box',
      zIndex: 9999
    }}>
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: '#151515',
        borderBottom: '1px solid #2a2a2a',
        padding: '20px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'orange', fontSize: '28px', fontWeight: 'bold' }}>✎</span>
          <span style={{ color: 'white', fontSize: '22px', fontWeight: 'bold' }}>AI</span>
          <span style={{ color: 'orange', fontSize: '22px', fontWeight: 'bold' }}>TUTOR</span>
          <span style={{
            marginLeft: '8px',
            fontSize: '11px',
            color: 'orange',
            border: '1px solid orange',
            backgroundColor: 'rgba(255, 165, 0, 0.1)',
            padding: '2px 8px',
            borderRadius: '4px',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            letterSpacing: '1px'
          }}>
            Admin Dashboard
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 14px',
            backgroundColor: '#222222',
            border: '1px solid #333333',
            borderRadius: '6px'
          }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              backgroundColor: 'orange',
              color: '#111111',
              fontWeight: 'bold',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {user?.name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div>
              <div style={{ fontSize: '13px', color: '#ffffff', fontWeight: 'bold' }}>
                {user?.name || 'Administrator'}
              </div>
              <div style={{ fontSize: '11px', color: '#cccccc' }}>
                {user?.email || 'admin@cognilearn.ai'}
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            style={{
              backgroundColor: 'transparent',
              color: '#f87171',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#f87171';
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px 80px 24px' }}>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#cccccc', fontSize: '14px' }}>
            Loading dashboard data...
          </div>
        ) : error ? (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '16px 20px',
            color: '#f87171',
            marginBottom: '24px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        ) : (
          <>
            {/* ── 1. USER OVERVIEW CARDS ─────────────────────────────────── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '20px',
              marginBottom: '32px'
            }}>
              {/* Total Registered Users */}
              <div style={{
                backgroundColor: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'orange', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                  Total Registered Users
                </div>
                <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#ffffff' }}>
                  {stats?.total_users || 0}
                </div>
                <div style={{ fontSize: '12px', color: '#cccccc', marginTop: '6px' }}>
                  Registered user accounts
                </div>
              </div>

              {/* Total Quizzes Attempted */}
              <div style={{
                backgroundColor: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'orange', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                  Total Quizzes Attempted
                </div>
                <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#ffffff' }}>
                  {stats?.total_practice || 0}
                </div>
                <div style={{ fontSize: '12px', color: '#cccccc', marginTop: '6px' }}>
                  Practice quiz records
                </div>
              </div>

              {/* Total Lessons Completed */}
              <div style={{
                backgroundColor: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'orange', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                  Total Lessons Completed
                </div>
                <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#ffffff' }}>
                  {stats?.total_history || 0}
                </div>
                <div style={{ fontSize: '12px', color: '#cccccc', marginTop: '6px' }}>
                  Classroom sessions completed
                </div>
              </div>
            </div>

            {/* ── 2. USERS TABLE SECTION ─────────────────────────────────── */}
            <div style={{
              backgroundColor: '#151515',
              border: '1px solid #2a2a2a',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
              {/* Header & Search Controls */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
                marginBottom: '20px'
              }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#ffffff' }}>
                    Registered Users Directory
                  </h2>
                  <p style={{ fontSize: '12px', color: '#cccccc', margin: '4px 0 0 0' }}>
                    User accounts, activity records, and performance metrics.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      backgroundColor: '#222222',
                      border: '1px solid #333333',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      color: '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      width: '240px'
                    }}
                  />

                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    style={{
                      backgroundColor: '#222222',
                      border: '1px solid #333333',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      color: '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="ALL">All Roles</option>
                    <option value="USER">User Role Only</option>
                    <option value="ADMIN">Admin Role Only</option>
                  </select>
                </div>
              </div>

              {/* Table wrapper for horizontal scroll on small screens */}
              <div style={{ overflowX: 'auto', width: '100%', borderRadius: '8px', border: '1px solid #262626' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1c1c1c', borderBottom: '1px solid #2a2a2a', color: 'orange' }}>
                      <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Name</th>
                      <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Email</th>
                      <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Role</th>
                      <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Account Creation</th>
                      <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Last Login</th>
                      <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>Lessons</th>
                      <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>Quizzes</th>
                      <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>Avg Score</th>
                      <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ padding: '36px 16px', textAlign: 'center', color: '#cccccc', fontStyle: 'italic' }}>
                          No user accounts match your search or filter.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isAdmin = u.role === 'admin';
                        const isSelf = u.id === user?.id;

                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid #262626' }}>
                            {/* Name */}
                            <td style={{ padding: '14px 16px', fontWeight: 'bold', color: '#ffffff' }}>
                              {u.name} {isSelf && <span style={{ fontSize: '11px', color: 'orange', marginLeft: '4px' }}>(You)</span>}
                            </td>

                            {/* Email */}
                            <td style={{ padding: '14px 16px', color: '#cccccc' }}>
                              {u.email}
                            </td>

                            {/* Role */}
                            <td style={{ padding: '14px 16px' }}>
                              {isAdmin ? (
                                <span style={{
                                  backgroundColor: 'rgba(255, 165, 0, 0.15)',
                                  color: 'orange',
                                  border: '1px solid orange',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 'bold'
                                }}>
                                  ADMIN
                                </span>
                              ) : (
                                <span style={{
                                  backgroundColor: '#222222',
                                  color: '#a1a1aa',
                                  border: '1px solid #333333',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 'bold'
                                }}>
                                  USER
                                </span>
                              )}
                            </td>

                            {/* Created At */}
                            <td style={{ padding: '14px 16px', color: '#cccccc', fontSize: '12px' }}>
                              {u.created_at || 'N/A'}
                            </td>

                            {/* Last Login */}
                            <td style={{ padding: '14px 16px', color: '#cccccc', fontSize: '12px', fontFamily: 'monospace' }}>
                              {u.last_login || 'Never'}
                            </td>

                            {/* Lessons Completed (Blank for Admin rows) */}
                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 'bold', color: '#ffffff' }}>
                              {isAdmin ? <span style={{ color: '#444444' }}>—</span> : u.lessons_completed}
                            </td>

                            {/* Quizzes Attempted (Blank for Admin rows) */}
                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 'bold', color: '#ffffff' }}>
                              {isAdmin ? <span style={{ color: '#444444' }}>—</span> : u.quizzes_attempted}
                            </td>

                            {/* Average Quiz Score (Blank for Admin rows) */}
                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 'bold', color: u.quizzes_attempted > 0 ? 'orange' : '#cccccc' }}>
                              {isAdmin ? <span style={{ color: '#444444' }}>—</span> : u.avg_quiz_score}
                            </td>

                            {/* Actions */}
                            <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                {/* View Details */}
                                <button
                                  onClick={() => handleViewDetails(u)}
                                  style={{
                                    backgroundColor: 'transparent',
                                    color: 'orange',
                                    border: '1px solid orange',
                                    borderRadius: '6px',
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  View Details
                                </button>

                                {/* Delete User (Disabled for ALL Admin accounts) */}
                                {!isAdmin && (
                                  <button
                                    onClick={() => setDeleteConfirmUser(u)}
                                    style={{
                                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                      color: '#f87171',
                                      border: '1px solid #ef4444',
                                      borderRadius: '6px',
                                      padding: '6px 12px',
                                      fontSize: '12px',
                                      fontWeight: 'bold',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s ease'
                                    }}
                                  >
                                    Delete User
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── 3. USER DETAILS MODAL ─────────────────────────────────────────── */}
      <AnimatePresence>
        {(selectedUserDetails || detailsLoading) && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                backgroundColor: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: '12px',
                padding: '28px',
                maxWidth: '680px',
                width: '100%',
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: '0 15px 40px rgba(0,0,0,0.9)',
                color: '#ffffff'
              }}
            >
              {detailsLoading ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: '#cccccc', fontSize: '14px' }}>
                  Loading user records...
                </div>
              ) : selectedUserDetails && (
                <>
                  {/* Modal Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #2a2a2a', paddingBottom: '14px' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#ffffff' }}>
                        User Details: {selectedUserDetails.user.name}
                      </h3>
                      <div style={{ fontSize: '12px', color: '#cccccc', marginTop: '2px' }}>
                        {selectedUserDetails.user.email}
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedUserDetails(null)}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: '#cccccc',
                        fontSize: '18px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Section 1: Basic Details (Shown for all users & admins) */}
                  <div style={{ marginBottom: selectedUserDetails.user.role === 'admin' ? '0' : '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'orange', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                      Basic Details
                    </div>
                    <div style={{
                      backgroundColor: '#222222',
                      border: '1px solid #333333',
                      borderRadius: '6px',
                      padding: '16px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '12px',
                      fontSize: '13px'
                    }}>
                      <div>
                        <span style={{ color: '#cccccc', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Name</span>
                        <strong style={{ color: '#ffffff' }}>{selectedUserDetails.user.name}</strong>
                      </div>

                      <div>
                        <span style={{ color: '#cccccc', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Email</span>
                        <strong style={{ color: '#ffffff' }}>{selectedUserDetails.user.email}</strong>
                      </div>

                      <div>
                        <span style={{ color: '#cccccc', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Role</span>
                        <strong style={{ color: selectedUserDetails.user.role === 'admin' ? 'orange' : '#ffffff' }}>
                          {selectedUserDetails.user.role?.toUpperCase()}
                        </strong>
                      </div>

                      <div>
                        <span style={{ color: '#cccccc', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Account Creation Date</span>
                        <strong style={{ color: '#ffffff' }}>{selectedUserDetails.user.created_at || 'N/A'}</strong>
                      </div>

                      <div>
                        <span style={{ color: '#cccccc', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Last Login</span>
                        <strong style={{ color: 'orange', fontFamily: 'monospace' }}>{selectedUserDetails.user.last_login}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Sections 2 & 3: Learning Statistics & Quiz History (Shown ONLY for normal USER accounts) */}
                  {selectedUserDetails.user.role !== 'admin' && (
                    <>
                      {/* Section 2: Learning Statistics */}
                      <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'orange', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                          Learning Statistics
                        </div>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '12px'
                        }}>
                          <div style={{ backgroundColor: '#222222', border: '1px solid #333333', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: '#cccccc', textTransform: 'uppercase', fontWeight: 'bold' }}>Lessons Completed</div>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginTop: '4px' }}>
                              {selectedUserDetails.stats.lessons_completed}
                            </div>
                          </div>

                          <div style={{ backgroundColor: '#222222', border: '1px solid #333333', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: '#cccccc', textTransform: 'uppercase', fontWeight: 'bold' }}>Quizzes Attempted</div>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginTop: '4px' }}>
                              {selectedUserDetails.stats.quizzes_attempted}
                            </div>
                          </div>

                          <div style={{ backgroundColor: '#222222', border: '1px solid #333333', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: '#cccccc', textTransform: 'uppercase', fontWeight: 'bold' }}>Average Quiz Score</div>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'orange', marginTop: '4px' }}>
                              {selectedUserDetails.stats.avg_quiz_score}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Quiz History */}
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'orange', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                          Quiz History
                        </div>

                        {selectedUserDetails.quiz_history.length === 0 ? (
                          <div style={{ backgroundColor: '#222222', border: '1px solid #333333', borderRadius: '6px', padding: '16px', textAlign: 'center', color: '#cccccc', fontStyle: 'italic', fontSize: '13px' }}>
                            No quiz records found for this user.
                          </div>
                        ) : (
                          <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid #333333' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#1c1c1c', borderBottom: '1px solid #333333', color: 'orange' }}>
                                  <th style={{ padding: '10px 12px' }}>Quiz Topic</th>
                                  <th style={{ padding: '10px 12px' }}>Subject</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Score Obtained</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Correct / Total</th>
                                  <th style={{ padding: '10px 12px' }}>Attempt Date/Time</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedUserDetails.quiz_history.map((q, idx) => {
                                  const scorePct = q.total > 0 ? Math.round((q.score / q.total) * 100) : 0;
                                  return (
                                    <tr key={q.id || idx} style={{ borderBottom: '1px solid #262626' }}>
                                      <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#ffffff' }}>{q.topic}</td>
                                      <td style={{ padding: '10px 12px', color: '#cccccc' }}>{q.subject}</td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: 'orange' }}>
                                        {scorePct}%
                                      </td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#ffffff' }}>
                                        {q.score} / {q.total}
                                      </td>
                                      <td style={{ padding: '10px 12px', color: '#cccccc', fontSize: '11px', fontFamily: 'monospace' }}>
                                        {q.date}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 4. DELETE USER CONFIRMATION DIALOG ───────────────────────────── */}
      <AnimatePresence>
        {deleteConfirmUser && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                backgroundColor: '#151515',
                border: '1px solid #ef4444',
                borderRadius: '12px',
                padding: '28px',
                maxWidth: '460px',
                width: '100%',
                boxShadow: '0 15px 40px rgba(0,0,0,0.9)',
                color: '#ffffff'
              }}
            >
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#ef4444' }}>
                Confirm User Deletion
              </h3>

              <p style={{ fontSize: '14px', color: '#cccccc', lineHeight: '1.6', marginBottom: '24px' }}>
                Are you sure you want to delete this user?
                <br /><br />
                This will permanently delete the user's account, lesson history, quiz progress and login activity.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  onClick={() => setDeleteConfirmUser(null)}
                  disabled={actionInProgress}
                  style={{
                    backgroundColor: '#222222',
                    color: '#ffffff',
                    border: '1px solid #333333',
                    borderRadius: '6px',
                    padding: '10px 18px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={handleConfirmDelete}
                  disabled={actionInProgress}
                  style={{
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px 20px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: actionInProgress ? 'wait' : 'pointer'
                  }}
                >
                  {actionInProgress ? 'Deleting...' : 'Delete User'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
