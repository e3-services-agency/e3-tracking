/**
 * Workspace admin: General (name, client_primary_color) and Members (list + invite by email).
 * Requires authenticated user and current workspace from store.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { WorkspaceMemberRole } from '@/src/types/schema';

const EMERALD = '#0DCC96';

interface WorkspaceInfo {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface WorkspaceSettingsInfo {
  workspace_id: string;
  audit_rules_json: string;
  client_primary_color: string | null;
  client_name: string | null;
  client_logo_url: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRole;
  created_at: string;
  updated_at: string;
}

export function WorkspaceSettings() {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const [tab, setTab] = useState<'general' | 'members'>('general');

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettingsInfo | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [clientPrimaryColor, setClientPrimaryColor] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientLogoUrl, setClientLogoUrl] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceMemberRole>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchWorkspaceAndSettings = useCallback(async () => {
    if (!activeWorkspaceId) {
      setWorkspace(null);
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/workspaces/${activeWorkspaceId}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load workspace');
        setWorkspace(null);
        setSettings(null);
        return;
      }
      setWorkspace(data.workspace ?? null);
      setSettings(data.settings ?? null);
      setName(data.workspace?.name ?? '');
      setClientPrimaryColor(data.settings?.client_primary_color ?? '');
      setClientName(data.settings?.client_name ?? '');
      setClientLogoUrl(data.settings?.client_logo_url ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setWorkspace(null);
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  const fetchMembers = useCallback(async () => {
    if (!activeWorkspaceId) {
      setMembers([]);
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/workspaces/${activeWorkspaceId}/members`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      setMembers([]);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    fetchWorkspaceAndSettings();
  }, [fetchWorkspaceAndSettings]);

  useEffect(() => {
    if (tab === 'members') fetchMembers();
  }, [tab, fetchMembers]);

  const handleSaveGeneral = async () => {
    if (!activeWorkspaceId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/workspaces/${activeWorkspaceId}`, {
        method: 'PATCH',
        headers: { Accept: 'application/json' },
        body: JSON.stringify({
          name: name.trim() || workspace?.name,
          client_primary_color: clientPrimaryColor.trim() || null,
          client_name: clientName.trim() || null,
          client_logo_url: clientLogoUrl.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to save');
        return;
      }
      if (data.workspace) setWorkspace(data.workspace);
      if (data.settings) setSettings(data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email || !activeWorkspaceId) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/workspaces/${activeWorkspaceId}/members`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError(
          typeof data?.error === 'string' ? data.error : data?.code === 'USER_NOT_FOUND' ? 'No user found with that email.' : 'Failed to invite'
        );
        return;
      }
      setInviteEmail('');
      fetchMembers();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setInviting(false);
    }
  };

  if (!activeWorkspaceId) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto text-center text-gray-500 py-12">
          Select a workspace to manage its settings and members.
        </div>
      </div>
    );
  }

  if (loading && !workspace) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto text-center text-gray-500 py-12">Loading workspace…</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab('general')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              tab === 'general'
                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 -mb-px'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => setTab('members')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              tab === 'members'
                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 -mb-px'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Members
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">
            {error}
          </div>
        )}

        {tab === 'general' && (
          <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Workspace & branding</h2>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Workspace name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Workspace"
                className="max-w-md"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Client primary color</label>
              <div className="flex items-center gap-2 max-w-md">
                <input
                  type="color"
                  value={clientPrimaryColor || EMERALD}
                  onChange={(e) => setClientPrimaryColor(e.target.value)}
                  className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                />
                <Input
                  value={clientPrimaryColor}
                  onChange={(e) => setClientPrimaryColor(e.target.value)}
                  placeholder="#0DCC96"
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Client name (optional)</label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client display name"
                className="max-w-md"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Client logo URL (optional)</label>
              <Input
                value={clientLogoUrl}
                onChange={(e) => setClientLogoUrl(e.target.value)}
                placeholder="https://…"
                className="max-w-md"
              />
            </div>
            <Button onClick={handleSaveGeneral} disabled={saving} style={{ backgroundColor: EMERALD }}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        )}

        {tab === 'members' && (
          <div className="bg-white p-6 rounded-lg border shadow-sm space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Members</h2>
            <div className="space-y-3">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 bg-gray-50/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900 truncate max-w-[120px]" title={m.user_id}>
                      {m.user_id.slice(0, 8)}…
                    </span>
                    <span className="text-sm text-gray-500">{m.user_id}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        m.role === 'admin'
                          ? 'bg-[var(--brand-primary)]/20 text-[var(--brand-primary)]'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {m.role}
                    </span>
                  </div>
                </div>
              ))}
              {members.length === 0 && <p className="text-sm text-gray-500">No members yet.</p>}
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Invite by email</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                  />
                </div>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as WorkspaceMemberRole)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm h-10"
                >
                  <option value="viewer">Viewer</option>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} style={{ backgroundColor: EMERALD }}>
                  {inviting ? 'Inviting…' : 'Invite'}
                </Button>
              </div>
              {inviteError && (
                <p className="text-sm text-red-600 mt-2">{inviteError}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
