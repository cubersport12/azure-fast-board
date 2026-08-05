import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createWorkItem,
  getMeta,
  getStatus,
  searchAssignees,
  type Assignee,
  type PathOption,
} from '../client';
import { isRichTextEmpty } from '../lib/clipboard-image';
import { loadCreatePrefs, resolvePref, saveCreatePrefs } from '../lib/create-prefs';
import { extractBlobSrcs } from '../lib/html-images';
import { attachModalFocusGuard } from '../lib/modal-focus';
import { RichTextEditor } from './RichTextEditor';
import { SelectField, type SelectOption } from './SelectField';

export type CreateModalProps = {
  workItemType: string;
  titleHint: string;
  channelId: string;
  rootId: string;
  onClose: () => void;
};

function toPathOptions(items: PathOption[]): SelectOption[] {
  return items.map((i) => ({
    value: i.path,
    label: i.name || i.path,
  }));
}

function toAssigneeOptions(items: Assignee[]): SelectOption[] {
  return items.map((a) => {
    const value = a.uniqueName || a.displayName;
    const label =
      a.uniqueName && a.displayName && a.uniqueName !== a.displayName
        ? `${a.displayName} (${a.uniqueName})`
        : a.displayName || a.uniqueName;
    return { value, label };
  });
}

export function CreateModal({
  workItemType,
  titleHint,
  channelId,
  rootId,
  onClose,
}: CreateModalProps) {
  const [type, setType] = useState(workItemType || 'Bug');
  const [title, setTitle] = useState(titleHint || '');
  const [body, setBody] = useState('');
  const [areaPath, setAreaPath] = useState('');
  const [iterationPath, setIterationPath] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [tags, setTags] = useState('');
  const [areas, setAreas] = useState<SelectOption[]>([]);
  const [iterations, setIterations] = useState<SelectOption[]>([]);
  const [assignees, setAssignees] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [project, setProject] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const pendingImages = useRef(new Map<string, File>());

  useEffect(() => {
    const detach = attachModalFocusGuard(modalRef.current);
    return () => {
      detach();
      pendingImages.current.forEach((_, url) => URL.revokeObjectURL(url));
      pendingImages.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getStatus();
        if (!status.connected) {
          setError('Нет подключения. Выполните /ado login');
          setLoading(false);
          return;
        }
        const projectName = status.project || '';
        setProject(projectName);
        const meta = await getMeta();
        if (cancelled) return;
        const areaOpts = toPathOptions(meta.areas || []);
        const iterOpts = toPathOptions(meta.iterations || []);
        let assigneeOpts = toAssigneeOptions(meta.assignees || []);
        const prefs = loadCreatePrefs(projectName);

        setAreas(areaOpts);
        setIterations(iterOpts);

        setAreaPath(resolvePref(prefs, 'areaPath', areaOpts));
        setIterationPath(resolvePref(prefs, 'iterationPath', iterOpts));

        // Keep last assignee even if not in the initial team list.
        let assigneeValue = resolvePref(prefs, 'assignedTo', assigneeOpts);
        const rawAssignee = Object.prototype.hasOwnProperty.call(prefs, 'assignedTo')
          ? String(prefs.assignedTo ?? '')
          : '';
        if (rawAssignee && !assigneeOpts.some((o) => o.value === rawAssignee)) {
          assigneeValue = rawAssignee;
          assigneeOpts = [{ value: rawAssignee, label: rawAssignee }, ...assigneeOpts];
        }
        setAssignees(assigneeOpts);
        setAssignedTo(assigneeValue);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSearchAssignees = useCallback(async (q: string) => {
    try {
      const res = await searchAssignees(q);
      setAssignees(toAssigneeOptions(res.items || []));
    } catch {
      // keep current list
    }
  }, []);

  const bodyLabel = useMemo(
    () => (/bug/i.test(type) ? 'Шаги воспроизведения' : 'Описание'),
    [type],
  );

  const onImageFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    pendingImages.current.set(url, file);
    return url;
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Укажите название');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const blobSrcs: string[] = [];
      const files: File[] = [];
      for (const src of extractBlobSrcs(body)) {
        const file = pendingImages.current.get(src);
        if (!file) continue;
        blobSrcs.push(src);
        files.push(file);
      }
      const textBody = isRichTextEmpty(body) && files.length === 0 ? '' : body;
      await createWorkItem({
        type,
        title: title.trim(),
        body: textBody,
        areaPath,
        iterationPath,
        assignedTo,
        tags,
        channelId,
        rootId,
        files,
        blobSrcs,
      });
      saveCreatePrefs(project, {
        areaPath,
        iterationPath,
        assignedTo,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="ado-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
    >
      <div
        ref={modalRef}
        className="ado-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        onKeyPress={(e) => e.stopPropagation()}
      >
        <div className="ado-modal-header">
          <h2>Создать {type}</h2>
          {project ? <span className="ado-modal-sub">{project}</span> : null}
          <button type="button" className="ado-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {loading ? (
          <div className="ado-modal-body">Загрузка…</div>
        ) : (
          <form className="ado-modal-body" onSubmit={onSubmit}>
            {error ? <div className="ado-error">{error}</div> : null}

            <div className="ado-row">
              <div className="ado-field">
                <label>Тип</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="Bug">Bug</option>
                  <option value="Task">Task</option>
                </select>
              </div>
              <div className="ado-field ado-grow">
                <label>Название</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Что нужно сделать?"
                  autoFocus
                />
              </div>
            </div>

            <div className="ado-row">
              <SelectField
                label="Area"
                value={areaPath}
                options={areas}
                onChange={setAreaPath}
                allowEmpty
                emptyLabel="Не указано"
              />
              <SelectField
                label="Итерация"
                value={iterationPath}
                options={iterations}
                onChange={setIterationPath}
                allowEmpty
                emptyLabel="Не указано"
              />
            </div>

            <SelectField
              label="Исполнитель"
              value={assignedTo}
              options={assignees}
              onChange={setAssignedTo}
              onSearch={onSearchAssignees}
              searchable
              allowEmpty
              emptyLabel="Не указано"
            />

            <div className="ado-field">
              <label>Тэги</label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="urgent; ui"
              />
            </div>

            <div className="ado-field">
              <label>{bodyLabel}</label>
              <RichTextEditor
                value={body}
                onChange={setBody}
                onImageFile={onImageFile}
                placeholder={`${bodyLabel}… Ctrl+V для скрина`}
              />
            </div>

            <div className="ado-actions">
              <button type="button" className="ado-btn-secondary" onClick={onClose}>
                Отмена
              </button>
              <button type="submit" className="ado-btn-primary" disabled={submitting}>
                {submitting ? 'Создание…' : 'Создать'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
