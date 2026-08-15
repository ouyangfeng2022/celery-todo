import { useEffect, useState } from 'react';
import type { Project, Todo } from '../../types';
import { useSettingsStore } from '../../store/useSettingsStore';
import * as data from '../../utils/dataGateway';
import { createTemplateFromProject, instantiateTemplate } from '../../utils/todoTemplates';
import { formatLocalDate } from '../../utils/planning';
import { XIcon } from '../common/Icons';

interface TemplateDialogProps {
  open: boolean;
  saveTarget?: { project: Project; todos: Todo[] } | null;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export function TemplateDialog({ open, saveTarget, onClose, onCreated }: TemplateDialogProps) {
  const customTemplates = useSettingsStore((state) => state.customTemplates);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [selectedId, setSelectedId] = useState('');
  const selected = customTemplates.find((template) => template.id === selectedId);
  const [startDate, setStartDate] = useState(() => formatLocalDate(new Date()));
  const [projectName, setProjectName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (saveTarget) setTemplateName(`${saveTarget.project.name} 模板`);
    else {
      const first =
        customTemplates.find((template) => template.id === selectedId) ?? customTemplates[0];
      setSelectedId(first?.id ?? '');
    }
  }, [customTemplates, open, saveTarget, selectedId]);

  useEffect(() => {
    if (selected) setProjectName(selected.projectName);
  }, [selected]);

  if (!open) return null;

  const saveCustom = async () => {
    if (!saveTarget || !templateName.trim()) return;
    try {
      const template = createTemplateFromProject(
        saveTarget.project,
        saveTarget.todos,
        templateName,
        includeCompleted,
      );
      const existing = customTemplates.find((item) => item.name === template.name);
      if (existing && !window.confirm(`已存在同名模板“${template.name}”，是否替换？`)) return;
      const next = existing
        ? customTemplates.map((item) =>
            item.id === existing.id ? { ...template, id: existing.id } : item,
          )
        : [...customTemplates, template];
      await updateSettings({ customTemplates: next });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存模板失败');
    }
  };

  const createFromTemplate = async () => {
    if (!selected || !projectName.trim()) return;
    try {
      const instance = instantiateTemplate(selected, projectName, startDate || undefined);
      const project = await data.createProjectWithTodos(instance.project, instance.todos);
      onCreated(project);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建项目失败');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/25 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="项目模板"
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-color)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div>
            <h2
              className="font-serif text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {saveTarget ? '保存为模板' : '从模板新建项目'}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {saveTarget ? saveTarget.project.name : '把重复的计划变成一次创建'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-2"
            aria-label="关闭模板窗口"
          >
            <XIcon size={16} />
          </button>
        </div>

        {saveTarget ? (
          <div className="space-y-5 p-5">
            <label className="block text-sm" style={{ color: 'var(--text-secondary)' }}>
              模板名称
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className="claude-input mt-2"
                autoFocus
              />
            </label>
            <label
              className="flex items-center gap-2 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(event) => setIncludeCompleted(event.target.checked)}
              />
              包含已完成事项（实例化后仍重置为未完成）
            </label>
            <div className="flex justify-end">
              <button type="button" onClick={() => void saveCustom()} className="btn-primary">
                保存模板
              </button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[360px] grid-cols-[220px_1fr]">
            <div
              className="border-r p-3"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            >
              {customTemplates.length === 0 && (
                <p
                  className="px-3 py-4 text-xs leading-5"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  暂无自定义模板。可在项目右键菜单中选择“保存为模板”。
                </p>
              )}
              {customTemplates.map((template) => (
                <div key={template.id} className="group mb-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedId(template.id)}
                    className="flex-1 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                    style={{
                      backgroundColor:
                        selectedId === template.id ? 'var(--accent-subtle)' : undefined,
                      color: selectedId === template.id ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <span className="block truncate font-medium">{template.name}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {template.items.length} 条事项
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`删除模板 ${template.name}`}
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => {
                      if (!window.confirm(`确定删除模板“${template.name}”吗？`)) return;
                      void updateSettings({
                        customTemplates: customTemplates.filter((item) => item.id !== template.id),
                      });
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {selected ? (
              <div className="space-y-4 p-5">
                <div>
                  <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {selected.name}
                  </h3>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    将创建 {selected.items.length} 条事项
                  </p>
                </div>
                <label className="block text-sm" style={{ color: 'var(--text-secondary)' }}>
                  项目名称
                  <input
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    className="claude-input mt-1.5"
                  />
                </label>
                {selected.items.some((item) => item.plannedDayOffset !== undefined) && (
                  <label className="block text-sm" style={{ color: 'var(--text-secondary)' }}>
                    起始日期
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="claude-input mt-1.5"
                    />
                  </label>
                )}
                <div
                  className="max-h-36 overflow-y-auto rounded-lg px-3 py-2"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  {selected.items.map((item) => (
                    <div
                      key={`${item.order}-${item.title}`}
                      className="py-1 text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {item.title}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void createFromTemplate()}
                    className="btn-primary"
                  >
                    创建项目
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="flex items-center justify-center px-8 text-center text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                保存一个常用项目后，可从这里重复创建。
              </div>
            )}
          </div>
        )}
        {error && (
          <p className="px-5 pb-4 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
