import React, { useEffect, useMemo, useState } from 'react';

export type SelectOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  searchable?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  onSearch,
  searchable,
  placeholder = 'Выберите…',
  allowEmpty,
  emptyLabel = 'Не указано',
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!searchable || !onSearch) return;
    const t = window.setTimeout(() => onSearch(query), 250);
    return () => window.clearTimeout(t);
  }, [query, searchable, onSearch]);

  const filtered = useMemo(() => {
    if (searchable && onSearch) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query, searchable, onSearch]);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ||
    (value ? value : allowEmpty ? emptyLabel : placeholder);

  return (
    <div className="ado-field">
      <label>{label}</label>
      <div className="ado-select">
        <button
          type="button"
          className="ado-select-trigger"
          onClick={() => setOpen((v) => !v)}
        >
          {selectedLabel}
        </button>
        {open && (
          <div className="ado-select-menu">
            {(searchable || options.length > 8) && (
              <input
                className="ado-select-search"
                value={query}
                placeholder="Поиск…"
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            <div className="ado-select-options">
              {allowEmpty && (
                <button
                  type="button"
                  className={!value ? 'active' : ''}
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  {emptyLabel}
                </button>
              )}
              {filtered.map((o) => (
                <button
                  key={o.value || o.label}
                  type="button"
                  className={o.value === value ? 'active' : ''}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  {o.label}
                </button>
              ))}
              {filtered.length === 0 && <div className="ado-select-empty">Нет вариантов</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
