import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookTemplate, FileText, FolderOpen, Search, UserCog, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toErrorMessage } from '../hooks/useApiQuery';
import { searchService } from '../services/search';
import type { GlobalSearchResults } from '../types/api';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

interface SearchItem {
  key: string;
  category: string;
  icon: typeof Users;
  label: string;
  description: string | null;
  to: string;
}

/** Converte a resposta do backend em uma lista plana (ordem = ordem de navegação por teclado). */
function toItems(results: GlobalSearchResults, canSeeUsers: boolean): SearchItem[] {
  const items: SearchItem[] = [];
  for (const c of results.clients) {
    items.push({ key: `client:${c.id}`, category: 'Clientes', icon: Users, label: c.label, description: c.description, to: `/clientes/${c.id}` });
  }
  for (const c of results.contracts) {
    items.push({
      key: `contract:${c.id}`,
      category: 'Contratos',
      icon: FileText,
      label: c.label,
      description: [c.clientName, c.description].filter(Boolean).join(' · '),
      to: `/contratos/${c.id}`,
    });
  }
  for (const t of results.templates) {
    items.push({ key: `template:${t.id}`, category: 'Modelos', icon: BookTemplate, label: t.label, description: t.description, to: '/modelos' });
  }
  for (const d of results.documents) {
    items.push({ key: `document:${d.id}`, category: 'Documentos', icon: FolderOpen, label: d.label, description: d.description, to: '/documentos' });
  }
  // Conveniência de UX: o backend já só devolve usuários para ADMIN.
  if (canSeeUsers) {
    for (const u of results.users) {
      items.push({ key: `user:${u.id}`, category: 'Usuários', icon: UserCog, label: u.label, description: u.description, to: '/usuarios' });
    }
  }
  return items;
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canSeeUsers = user?.role === 'ADMIN';

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const term = query.trim();
  const searchable = term.length >= MIN_CHARS;
  const items = useMemo(() => (results ? toItems(results, canSeeUsers) : []), [results, canSeeUsers]);

  // Debounce + descarte de respostas atrasadas (só a última requisição atualiza a tela).
  useEffect(() => {
    if (!searchable) {
      requestId.current += 1;
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    const timeout = setTimeout(() => {
      searchService
        .global(term)
        .then((response) => {
          if (id !== requestId.current) return;
          setResults(response.results);
          setError(null);
          setActiveIndex(-1);
        })
        .catch((err: unknown) => {
          if (id !== requestId.current) return;
          setResults(null);
          setError(toErrorMessage(err, 'Não foi possível buscar agora.'));
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [term, searchable]);

  // Fecha ao clicar fora.
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const select = useCallback(
    (item: SearchItem) => {
      setOpen(false);
      setQuery('');
      setResults(null);
      navigate(item.to);
    },
    [navigate],
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true);
    }
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[activeIndex >= 0 ? activeIndex : 0];
      if (item) select(item);
    }
  };

  const showPanel = open && searchable;
  let lastCategory = '';

  return (
    <div ref={containerRef} className="relative flex-1">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `global-search-item-${activeIndex}` : undefined}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Buscar clientes, contratos..."
        className="w-full pl-9 pr-9 py-1.5 text-sm rounded-md border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
      />
      {loading && (
        <div
          className="absolute right-9 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
          aria-label="Buscando"
        />
      )}

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border rounded-lg shadow-lg max-h-96 overflow-y-auto min-w-[20rem]"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {error ? (
            <div className="px-4 py-3 text-sm" style={{ color: '#DC2626' }}>{error}</div>
          ) : loading && !results ? (
            <div className="px-4 py-3 text-sm text-slate-500">Buscando...</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">
              {results ? 'Nenhum resultado encontrado.' : 'Buscando...'}
            </div>
          ) : (
            items.map((item, index) => {
              const showHeader = item.category !== lastCategory;
              lastCategory = item.category;
              const active = index === activeIndex;
              return (
                <div key={item.key}>
                  {showHeader && (
                    <div
                      className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-widest bg-slate-50 ${index > 0 ? 'border-t' : ''}`}
                      style={{ color: 'var(--color-muted-foreground)', borderColor: 'var(--color-border)' }}
                    >
                      {item.category}
                    </div>
                  )}
                  <button
                    type="button"
                    id={`global-search-item-${index}`}
                    role="option"
                    aria-selected={active}
                    // mouseDown (não click) para selecionar antes do input perder o foco.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      select(item);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full flex items-start gap-3 px-4 py-2 text-left ${active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                  >
                    <item.icon size={15} className="mt-0.5 flex-shrink-0 text-slate-400" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900 truncate">{item.label}</span>
                      {item.description && (
                        <span className="block text-xs truncate" style={{ color: 'var(--color-muted-foreground)' }}>
                          {item.description}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
