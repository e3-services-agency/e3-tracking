/**
 * Catalogs & Data Governance page. List, create, edit catalogs; manage fields and lookup key.
 */
import React, { useState, useEffect } from 'react';
import { Plus, Database, AlertCircle } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import type { CatalogRow, CatalogType } from '@/src/types/schema';
import { useCatalogs } from '@/src/features/catalogs/hooks/useCatalogs';

function CatalogTypeBadge({ type }: { type: CatalogType }) {
  // Type is descriptive (not a semantic state), so keep it neutral.
  const styles: Record<CatalogType, string> = {
    Product: 'bg-gray-100 text-gray-800 border-gray-200',
    Variant: 'bg-gray-100 text-gray-800 border-gray-200',
    General: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[type]}`}>
      {type}
    </span>
  );
}
import { CatalogFormModal } from '@/src/features/catalogs/components/CatalogFormModal';
import { CatalogDetail } from '@/src/features/catalogs/components/CatalogDetail';

export function Catalogs() {
  const {
    catalogs,
    isLoading,
    error,
    fetchCatalogs,
    createCatalog,
    updateCatalog,
    deleteCatalog,
  } = useCatalogs();
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogRow | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<CatalogRow | null>(null);

  const handleCreateCatalog = async (input: Parameters<typeof createCatalog>[0]) => {
    const result = await createCatalog(input);
    return { success: result.success, error: result.success ? undefined : result.error };
  };

  const handleUpdateCatalog = async (input: Parameters<typeof createCatalog>[0]) => {
    if (!editingCatalog) return { success: false, error: 'No catalog selected' };
    const result = await updateCatalog(editingCatalog.id, input);
    return { success: result.success, error: result.success ? undefined : result.error };
  };

  const handleOpenEdit = () => {
    if (selectedCatalog) {
      setEditingCatalog(selectedCatalog);
      setIsFormOpen(true);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingCatalog(null);
  };

  useEffect(() => {
    if (selectedCatalog && !catalogs.some((c) => c.id === selectedCatalog.id)) {
      setSelectedCatalog(null);
    }
  }, [selectedCatalog, catalogs]);

  const detailCatalog = selectedCatalog
    ? (catalogs.find((c) => c.id === selectedCatalog.id) ?? null)
    : null;

  return (
    <div className="flex flex-1 flex-col h-full bg-[var(--surface-default)]">
      {detailCatalog ? (
        <CatalogDetail
          catalog={detailCatalog}
          onBack={() => setSelectedCatalog(null)}
          onEdit={handleOpenEdit}
        />
      ) : (
        <>
          <div className="p-6 border-b bg-white">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Catalogs & Data Governance
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Document CDP lookup tables and map event properties to catalog fields.
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditingCatalog(null);
                  setIsFormOpen(true);
                }}
                className="gap-2"
              >
                <Plus className="w-4 h-4" /> New Catalog
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {error && (
              <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span className="text-sm text-red-800">{error}</span>
                <Button variant="outline" size="sm" onClick={() => fetchCatalogs()}>
                  Retry
                </Button>
              </div>
            )}
            {isLoading ? (
              <p className="text-gray-500">Loading catalogs…</p>
            ) : catalogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 bg-white border border-dashed border-gray-200 rounded-lg">
                <Database className="w-14 h-14 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No catalogs yet</h3>
                <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
                  Create a catalog to document a CDP lookup table (e.g. Products, Users) and map event properties to its fields.
                </p>
                <Button
                  onClick={() => setIsFormOpen(true)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" /> Create your first Catalog
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {catalogs.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCatalog(c)}
                    className="text-left p-5 rounded-xl border border-gray-200 bg-white hover:border-[var(--brand-primary)]/50 hover:shadow-md transition-all"
                  >
                    <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                      {c.name}
                    </h3>
                    {c.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{c.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <CatalogTypeBadge type={(c.catalog_type as CatalogType) || 'General'} />
                      {c.source_system && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {c.source_system}
                        </span>
                      )}
                      {c.sync_method && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {c.sync_method}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <CatalogFormModal
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        catalog={editingCatalog}
        onSubmit={editingCatalog ? handleUpdateCatalog : handleCreateCatalog}
      />
    </div>
  );
}
