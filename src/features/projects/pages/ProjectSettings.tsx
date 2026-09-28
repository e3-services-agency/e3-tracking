/**
 * Project settings (replaces WorkspaceSettings.tsx, D-15): name, client, the three Bloomreach
 * identifiers (D-27) and the project default expiration. Local auth mode has no roles to manage
 * (D-13), so there is no Members tab here.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useClients } from '@/src/features/clients/hooks/useClients';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { EXPIRATION_UNITS, LIBRARY_INDUSTRIES } from '@/src/domain/enums';

/** T-3-10 QA fix (ERROR 1, 2026-09-28 10:22): sentinel select values distinct from any real industry string. */
const INDUSTRY_NOT_SET = '';
const INDUSTRY_OTHER = '__other__';

const EMERALD = 'var(--brand-primary)';

interface ProjectDetail {
  id: string;
  name: string;
  key: string;
  client_id: string;
  client_primary_color: string | null;
  bloomreach_api_customer_id_key: string | null;
  bloomreach_project_token: string | null;
  bloomreach_api_base_url: string | null;
  bloomreach_project_url: string | null;
  default_expiration_json: { enabled: boolean; count: number; units: string } | null;
  money_tolerance_percent: number;
  money_tolerance_floor: number;
  /** T-3-10 (D-57): optional free-text industry, used as the templates page's default facet filter. */
  industry: string | null;
}

export function ProjectSettings() {
  const { activeProjectId, fetchProjects } = useProjectShell();
  const { clients, fetchClients } = useClients();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientPrimaryColor, setClientPrimaryColor] = useState('');
  const [customerIdKey, setCustomerIdKey] = useState('');
  const [projectToken, setProjectToken] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [expirationEnabled, setExpirationEnabled] = useState(false);
  const [expirationCount, setExpirationCount] = useState(30);
  const [expirationUnits, setExpirationUnits] = useState<string>('days');
  const [moneyTolerancePercent, setMoneyTolerancePercent] = useState(1);
  const [moneyToleranceFloor, setMoneyToleranceFloor] = useState(0.01);
  // T-3-10 QA fix (ERROR 1): `industrySelect` is one of INDUSTRY_NOT_SET, a LIBRARY_INDUSTRIES
  // value, or INDUSTRY_OTHER (which reveals `industryOtherText` below it). `industry` is free text
  // on the wire (D-57), not a closed enum, so a project already carrying a value outside the
  // suggested list must still round-trip through the "other" text box, not be silently dropped.
  const [industrySelect, setIndustrySelect] = useState<string>(INDUSTRY_NOT_SET);
  const [industryOtherText, setIndustryOtherText] = useState('');

  const fetchProject = useCallback(async () => {
    if (!activeProjectId) {
      setProject(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load project');
        setProject(null);
        return;
      }
      const p = data as ProjectDetail;
      setProject(p);
      setName(p.name ?? '');
      setClientId(p.client_id ?? '');
      setClientPrimaryColor(p.client_primary_color ?? '');
      setCustomerIdKey(p.bloomreach_api_customer_id_key ?? '');
      setProjectToken(p.bloomreach_project_token ?? '');
      setApiBaseUrl(p.bloomreach_api_base_url ?? '');
      setProjectUrl(p.bloomreach_project_url ?? '');
      setExpirationEnabled(p.default_expiration_json?.enabled ?? false);
      setExpirationCount(p.default_expiration_json?.count ?? 30);
      setExpirationUnits(p.default_expiration_json?.units ?? 'days');
      setMoneyTolerancePercent(p.money_tolerance_percent ?? 1);
      setMoneyToleranceFloor(p.money_tolerance_floor ?? 0.01);
      const industry = p.industry?.trim() || '';
      if (!industry) {
        setIndustrySelect(INDUSTRY_NOT_SET);
        setIndustryOtherText('');
      } else if ((LIBRARY_INDUSTRIES as readonly string[]).includes(industry)) {
        setIndustrySelect(industry);
        setIndustryOtherText('');
      } else {
        setIndustrySelect(INDUSTRY_OTHER);
        setIndustryOtherText(industry);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    fetchProject();
    fetchClients();
  }, [fetchProject, fetchClients]);

  const handleSave = async () => {
    if (!activeProjectId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}`, {
        method: 'PATCH',
        headers: { Accept: 'application/json' },
        body: JSON.stringify({
          name: name.trim() || project?.name,
          client_id: clientId || undefined,
          client_primary_color: clientPrimaryColor.trim() || null,
          bloomreach_api_customer_id_key: customerIdKey.trim() || null,
          bloomreach_project_token: projectToken.trim() || null,
          bloomreach_api_base_url: apiBaseUrl.trim() || null,
          bloomreach_project_url: projectUrl.trim() || null,
          default_expiration_json: expirationEnabled
            ? { enabled: true, count: expirationCount, units: expirationUnits }
            : { enabled: false, count: expirationCount, units: expirationUnits },
          money_tolerance_percent: moneyTolerancePercent,
          money_tolerance_floor: moneyToleranceFloor,
          industry:
            industrySelect === INDUSTRY_NOT_SET
              ? null
              : industrySelect === INDUSTRY_OTHER
                ? industryOtherText.trim() || null
                : industrySelect,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to save');
        return;
      }
      setProject(data as ProjectDetail);
      await fetchProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  if (!activeProjectId) {
    return (
      <div className="bg-white p-6 rounded-lg border shadow-sm text-center text-gray-500">
        Select a project to manage its settings.
      </div>
    );
  }

  if (loading && !project) {
    return <div className="bg-white p-6 rounded-lg border shadow-sm text-center text-gray-500">Loading project…</div>;
  }

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Project & Bloomreach</h2>
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Project name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Client</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full max-w-md h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
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
          <Input value={clientPrimaryColor} onChange={(e) => setClientPrimaryColor(e.target.value)} placeholder="e.g. 0DCC96" className="flex-1" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Bloomreach API customer identifier</label>
        <Input value={customerIdKey} onChange={(e) => setCustomerIdKey(e.target.value)} placeholder="registered" className="max-w-md font-mono" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Bloomreach project token</label>
        <Input value={projectToken} onChange={(e) => setProjectToken(e.target.value)} className="max-w-md font-mono" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Bloomreach API base URL</label>
        <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://api.exponea.com" className="max-w-md" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Bloomreach project URL</label>
        <Input value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} placeholder="https://app.exponea.com/..." className="max-w-md" />
      </div>

      <div className="space-y-2 border-t pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={expirationEnabled} onChange={(e) => setExpirationEnabled(e.target.checked)} />
          Default event expiration
        </label>
        <div className="flex items-center gap-2 max-w-md">
          <Input
            type="number"
            value={expirationCount}
            onChange={(e) => setExpirationCount(Number(e.target.value) || 0)}
            className="w-24"
            disabled={!expirationEnabled}
          />
          <select
            value={expirationUnits}
            onChange={(e) => setExpirationUnits(e.target.value)}
            disabled={!expirationEnabled}
            className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            {EXPIRATION_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2 border-t pt-4">
        <label className="block text-sm font-medium text-gray-700">Industry</label>
        <p className="text-xs text-gray-500">Used as the use case templates page's default industry filter (D-57).</p>
        <select
          value={industrySelect}
          onChange={(e) => setIndustrySelect(e.target.value)}
          className="w-full max-w-md h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        >
          <option value={INDUSTRY_NOT_SET}>Not set</option>
          {LIBRARY_INDUSTRIES.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
          <option value={INDUSTRY_OTHER}>Other…</option>
        </select>
        {industrySelect === INDUSTRY_OTHER && (
          <Input
            value={industryOtherText}
            onChange={(e) => setIndustryOtherText(e.target.value)}
            placeholder="e.g. aerospace"
            className="max-w-md"
          />
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <label className="block text-sm font-medium text-gray-700">Money tolerance (rules, D-30)</label>
        <p className="text-xs text-gray-500">Used by rules with `tolerance_mode: money` (e.g. purchase totals vs items): tolerance = max(floor, percent% of the target).</p>
        <div className="flex items-center gap-3 max-w-md">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={moneyTolerancePercent}
              onChange={(e) => setMoneyTolerancePercent(Number(e.target.value) || 0)}
              className="w-20"
            />
            <span className="text-xs text-gray-500">% of target</span>
          </div>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={moneyToleranceFloor}
              onChange={(e) => setMoneyToleranceFloor(Number(e.target.value) || 0)}
              className="w-20"
            />
            <span className="text-xs text-gray-500">absolute floor</span>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: EMERALD }}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  );
}
