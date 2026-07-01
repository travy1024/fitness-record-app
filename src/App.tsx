import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Dumbbell,
  History,
  LayoutTemplate,
  Library,
  LineChart,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart as ReLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  MUSCLES,
  QUICK_REPS,
  QUICK_WEIGHTS,
  WORKOUT_TYPES,
  createWorkout,
  loadData,
  saveData,
  todayISO,
  uid,
} from './data';
import type {
  AppData,
  Exercise,
  MovementType,
  TemplateExercise,
  Unit,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutTemplate,
  WorkoutType,
} from './types';

type TabKey = 'today' | 'record' | 'history' | 'library' | 'analytics' | 'templates';

type ExerciseDraft = {
  id?: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string;
  movementType: MovementType;
  defaultUnit: Unit;
  notes: string;
};

type TemplateDraft = {
  id?: string;
  name: string;
  notes: string;
  exercises: TemplateExercise[];
};

type TrendPoint = {
  date: string;
  workoutId: string;
  maxWeight: number;
  volume: number;
  totalSets: number;
  maxReps: number;
  estimated1RM: number;
  bestSet?: WorkoutSet;
};

const navItems = [
  { key: 'today', label: '今日', icon: CalendarDays },
  { key: 'record', label: '记录', icon: Dumbbell },
  { key: 'history', label: '历史', icon: History },
  { key: 'library', label: '动作库', icon: Library },
  { key: 'analytics', label: '趋势', icon: LineChart },
  { key: 'templates', label: '模板', icon: LayoutTemplate },
] satisfies Array<{ key: TabKey; label: string; icon: typeof CalendarDays }>;

const movementLabels: Record<MovementType, string> = {
  push: '推',
  pull: '拉',
  squat: '蹲',
  hinge: '髋铰链',
  isolation: '孤立',
  core: '核心',
  cardio: '有氧',
};

const workoutLabels: Record<WorkoutType, string> = {
  胸: '胸日',
  背: '背日',
  肩: '肩日',
  腿: '腿日',
  臂: '臂日',
  休息: '休息日',
  自定义: '自定义训练',
};

const emptyExerciseDraft: ExerciseDraft = {
  name: '',
  primaryMuscle: '胸',
  secondaryMuscles: '',
  movementType: 'push',
  defaultUnit: 'lb',
  notes: '',
};

const emptyTemplateDraft: TemplateDraft = {
  name: '',
  notes: '',
  exercises: [],
};

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value: number, digits = 0) {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, digits),
  }).format(value);
}

function dateFromISO(date: string) {
  return new Date(`${date}T12:00:00`);
}

function weekday(date: string) {
  return dateFromISO(date).toLocaleDateString('zh-CN', { weekday: 'long' });
}

function fullDate(date: string) {
  return dateFromISO(date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function convertWeight(weight: number, from: Unit, to: Unit) {
  if (from === to) return weight;
  return from === 'kg' ? weight * 2.20462262 : weight / 2.20462262;
}

function createSet(unit: Unit = 'lb', reps = 0): WorkoutSet {
  return {
    id: uid('set'),
    weight: 0,
    unit,
    reps,
    rpe: undefined,
    isWarmup: false,
  };
}

function parseRepStart(repRange?: string) {
  if (!repRange) return 0;
  const match = repRange.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function createWorkoutExercise(exercise: Exercise, template?: TemplateExercise): WorkoutExercise {
  const reps = parseRepStart(template?.repRange);
  const setCount = Math.max(1, template?.defaultSets ?? 1);
  return {
    id: uid('entry'),
    exerciseId: exercise.id,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle,
    notes: template?.notes ?? exercise.notes ?? '',
    sets: Array.from({ length: setCount }, () => createSet(exercise.defaultUnit, reps)),
  };
}

function inferWorkoutType(templateName: string): WorkoutType {
  if (templateName.includes('胸')) return '胸';
  if (templateName.includes('背')) return '背';
  if (templateName.includes('肩')) return '肩';
  if (templateName.includes('腿')) return '腿';
  if (templateName.includes('臂')) return '臂';
  return '自定义';
}

function exerciseVolume(sets: WorkoutSet[], unit: Unit) {
  return sets.reduce((sum, set) => sum + convertWeight(set.weight, set.unit, unit) * set.reps, 0);
}

function estimatedOneRM(set: WorkoutSet, unit: Unit) {
  return convertWeight(set.weight, set.unit, unit) * (1 + set.reps / 30);
}

function workoutTotals(workout: Workout) {
  const totalSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const volume = workout.exercises.reduce((sum, exercise) => sum + exerciseVolume(exercise.sets, 'lb'), 0);
  return { totalSets, volume };
}

function matchWorkoutExercise(entry: WorkoutExercise, exercise: Exercise) {
  return entry.exerciseId === exercise.id || entry.name === exercise.name;
}

function summarizeExercise(entry: WorkoutExercise, unit: Unit) {
  if (!entry.sets.length) return '暂无组';
  const best = entry.sets.reduce((current, set) =>
    estimatedOneRM(set, unit) > estimatedOneRM(current, unit) ? set : current,
  );
  return `${fmt(convertWeight(best.weight, best.unit, unit), 1)} ${unit} × ${best.reps}`;
}

function getLastPerformance(
  workouts: Workout[],
  entry: WorkoutExercise,
  currentDate: string,
  currentWorkoutId: string,
) {
  const sorted = [...workouts]
    .filter((workout) => workout.id !== currentWorkoutId && workout.completed && workout.date < currentDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const workout of sorted) {
    const found = workout.exercises.find(
      (exercise) =>
        (entry.exerciseId && exercise.exerciseId === entry.exerciseId) || exercise.name === entry.name,
    );
    if (found) {
      return {
        date: fullDate(workout.date),
        summary: summarizeExercise(found, found.sets[0]?.unit ?? 'lb'),
      };
    }
  }
  return undefined;
}

function buildTrend(workouts: Workout[], exercise: Exercise, unit: Unit): TrendPoint[] {
  return workouts
    .filter((workout) => workout.completed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((workout) => {
      const entry = workout.exercises.find((candidate) => matchWorkoutExercise(candidate, exercise));
      if (!entry || !entry.sets.length) return [];
      const maxWeight = Math.max(...entry.sets.map((set) => convertWeight(set.weight, set.unit, unit)));
      const maxReps = Math.max(...entry.sets.map((set) => set.reps));
      const bestSet = entry.sets.reduce((best, set) =>
        estimatedOneRM(set, unit) > estimatedOneRM(best, unit) ? set : best,
      );
      return [
        {
          date: fullDate(workout.date),
          workoutId: workout.id,
          maxWeight,
          volume: exerciseVolume(entry.sets, unit),
          totalSets: entry.sets.length,
          maxReps,
          estimated1RM: estimatedOneRM(bestSet, unit),
          bestSet,
        },
      ];
    });
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#8E8E93]">{children}</label>;
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[28px] border border-[#252525] bg-[#151515] p-5', className)}>
      {children}
    </section>
  );
}

function Button({
  children,
  onClick,
  variant = 'plain',
  className,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'plain' | 'primary' | 'danger';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'tap inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35',
        variant === 'primary' && 'bg-white text-black',
        variant === 'plain' && 'border border-[#252525] bg-[#1C1C1E] text-white',
        variant === 'danger' && 'border border-[#3A3A3C] bg-[#161616] text-[#F5F5F7]',
        className,
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'tap inline-flex items-center justify-center rounded-full border border-[#252525] bg-[#1C1C1E] text-[#F5F5F7] transition active:scale-[0.96] disabled:opacity-35',
        danger && 'border-[#3A3A3C] text-[#F5F5F7]',
      )}
    >
      {children}
    </button>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, inputMode, onFocus, type, ...rest } = props;
  const isNumberInput = type === 'number';

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (isNumberInput && event.currentTarget.value === '0') {
      const input = event.currentTarget;
      window.requestAnimationFrame(() => input.select());
    }
    onFocus?.(event);
  };

  return (
    <input
      {...rest}
      type={isNumberInput ? 'text' : type}
      inputMode={inputMode ?? (isNumberInput ? 'decimal' : undefined)}
      onFocus={handleFocus}
      className={cn(
        'h-12 min-w-0 max-w-full w-full rounded-2xl border border-[#252525] bg-[#0A0A0A] px-4 text-base text-white outline-none transition placeholder:text-[#636366] focus:border-[#3A3A3C]',
        className,
      )}
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'h-12 min-w-0 max-w-full w-full rounded-2xl border border-[#252525] bg-[#0A0A0A] px-4 text-base text-white outline-none transition focus:border-[#3A3A3C]',
        props.className,
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-w-0 max-w-full w-full resize-none rounded-2xl border border-[#252525] bg-[#0A0A0A] px-4 py-3 text-base text-white outline-none transition placeholder:text-[#636366] focus:border-[#3A3A3C]',
        props.className,
      )}
    />
  );
}

function NumberStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[#8E8E93]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-white">{value}</div>
    </div>
  );
}

function normalizeBackup(value: unknown): AppData | null {
  if (!value || typeof value !== 'object') return null;
  const wrapped = value as { data?: unknown };
  const candidate = (wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : value) as Partial<AppData>;
  if (!Array.isArray(candidate.workouts) || !Array.isArray(candidate.exercises) || !Array.isArray(candidate.templates)) {
    return null;
  }
  return {
    version: typeof candidate.version === 'number' ? candidate.version : 1,
    workouts: candidate.workouts.length ? candidate.workouts : [createWorkout()],
    exercises: candidate.exercises,
    templates: candidate.templates,
  };
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [selectedWorkoutId, setSelectedWorkoutId] = useState('');
  const [templateChoice, setTemplateChoice] = useState('');
  const [exerciseChoice, setExerciseChoice] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState<'全部' | WorkoutType>('全部');
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryMuscle, setLibraryMuscle] = useState('全部');
  const [exerciseDraft, setExerciseDraft] = useState<ExerciseDraft>(emptyExerciseDraft);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(emptyTemplateDraft);
  const [templateExerciseChoice, setTemplateExerciseChoice] = useState('');
  const [analysisExerciseId, setAnalysisExerciseId] = useState('');
  const [backupMessage, setBackupMessage] = useState('');

  const visibleExercises = useMemo(
    () => data.exercises.filter((exercise) => !exercise.isArchived),
    [data.exercises],
  );
  const today = todayISO();
  const todayWorkout = useMemo(
    () => data.workouts.find((workout) => workout.date === today) ?? data.workouts[0],
    [data.workouts, today],
  );
  const selectedWorkout = useMemo(
    () => data.workouts.find((workout) => workout.id === selectedWorkoutId) ?? todayWorkout,
    [data.workouts, selectedWorkoutId, todayWorkout],
  );

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    if (!selectedWorkoutId && todayWorkout) setSelectedWorkoutId(todayWorkout.id);
  }, [selectedWorkoutId, todayWorkout]);

  useEffect(() => {
    if (!templateChoice && data.templates[0]) setTemplateChoice(data.templates[0].id);
  }, [data.templates, templateChoice]);

  useEffect(() => {
    if (!exerciseChoice && visibleExercises[0]) setExerciseChoice(visibleExercises[0].id);
    if (!templateExerciseChoice && visibleExercises[0]) setTemplateExerciseChoice(visibleExercises[0].id);
    if (!analysisExerciseId && visibleExercises[0]) {
      setAnalysisExerciseId(visibleExercises.find((exercise) => exercise.isFavorite)?.id ?? visibleExercises[0].id);
    }
  }, [analysisExerciseId, exerciseChoice, templateExerciseChoice, visibleExercises]);

  const updateWorkout = (workoutId: string, updater: (workout: Workout) => Workout) => {
    setData((current) => ({
      ...current,
      workouts: current.workouts.map((workout) => (workout.id === workoutId ? updater(workout) : workout)),
    }));
  };

  const updateExerciseEntry = (
    workoutId: string,
    entryId: string,
    updater: (entry: WorkoutExercise) => WorkoutExercise,
  ) => {
    updateWorkout(workoutId, (workout) => ({
      ...workout,
      exercises: workout.exercises.map((entry) => (entry.id === entryId ? updater(entry) : entry)),
    }));
  };

  const updateSet = (
    workoutId: string,
    entryId: string,
    setId: string,
    updater: (set: WorkoutSet) => WorkoutSet,
  ) => {
    updateExerciseEntry(workoutId, entryId, (entry) => ({
      ...entry,
      sets: entry.sets.map((set) => (set.id === setId ? updater(set) : set)),
    }));
  };

  const addExerciseToWorkout = (workoutId: string, exerciseId: string) => {
    const exercise = visibleExercises.find((item) => item.id === exerciseId);
    if (!exercise) return;
    updateWorkout(workoutId, (workout) => ({
      ...workout,
      exercises: [...workout.exercises, createWorkoutExercise(exercise)],
    }));
  };

  const applyTemplateToToday = () => {
    if (!todayWorkout) return;
    const template = data.templates.find((item) => item.id === templateChoice);
    if (!template) return;
    const nextExercises = template.exercises
      .map((item) => {
        const exercise = visibleExercises.find((candidate) => candidate.id === item.exerciseId);
        return exercise ? createWorkoutExercise(exercise, item) : undefined;
      })
      .filter(Boolean) as WorkoutExercise[];
    updateWorkout(todayWorkout.id, (workout) => ({
      ...workout,
      type: inferWorkoutType(template.name),
      exercises: nextExercises,
      notes: template.notes ?? workout.notes,
    }));
    setSelectedWorkoutId(todayWorkout.id);
  };

  const moveExercise = (workoutId: string, index: number, direction: -1 | 1) => {
    updateWorkout(workoutId, (workout) => {
      const target = index + direction;
      if (target < 0 || target >= workout.exercises.length) return workout;
      const next = [...workout.exercises];
      const [entry] = next.splice(index, 1);
      next.splice(target, 0, entry);
      return { ...workout, exercises: next };
    });
  };

  const duplicateLastSet = (workoutId: string, entry: WorkoutExercise) => {
    const last = entry.sets[entry.sets.length - 1];
    const copied = last ? { ...last, id: uid('set') } : createSet('lb');
    updateExerciseEntry(workoutId, entry.id, (current) => ({ ...current, sets: [...current.sets, copied] }));
  };

  const saveExerciseDraft = () => {
    if (!exerciseDraft.name.trim()) return;
    const nextExercise: Exercise = {
      id: exerciseDraft.id ?? uid('ex'),
      name: exerciseDraft.name.trim(),
      primaryMuscle: exerciseDraft.primaryMuscle,
      secondaryMuscles: exerciseDraft.secondaryMuscles
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      movementType: exerciseDraft.movementType,
      defaultUnit: exerciseDraft.defaultUnit,
      notes: exerciseDraft.notes,
      isArchived: false,
      isFavorite: exerciseDraft.id
        ? data.exercises.find((exercise) => exercise.id === exerciseDraft.id)?.isFavorite
        : false,
    };
    setData((current) => ({
      ...current,
      exercises: exerciseDraft.id
        ? current.exercises.map((exercise) => (exercise.id === exerciseDraft.id ? nextExercise : exercise))
        : [...current.exercises, nextExercise],
    }));
    setExerciseDraft(emptyExerciseDraft);
  };

  const saveTemplateDraft = () => {
    if (!templateDraft.name.trim()) return;
    const nextTemplate: WorkoutTemplate = {
      id: templateDraft.id ?? uid('tpl'),
      name: templateDraft.name.trim(),
      notes: templateDraft.notes,
      exercises: templateDraft.exercises,
    };
    setData((current) => ({
      ...current,
      templates: templateDraft.id
        ? current.templates.map((template) => (template.id === templateDraft.id ? nextTemplate : template))
        : [...current.templates, nextTemplate],
    }));
    setTemplateDraft(emptyTemplateDraft);
  };

  const exportBackup = () => {
    const payload = {
      app: 'iron-ledger',
      exportedAt: new Date().toISOString(),
      data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `iron-ledger-backup-${todayISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMessage('备份文件已导出。');
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const nextData = normalizeBackup(parsed);
      if (!nextData) throw new Error('Invalid backup');
      if (!window.confirm('导入后会替换这个浏览器里当前保存的数据。继续吗？')) return;
      setData(nextData);
      const nextWorkout = nextData.workouts.find((workout) => workout.date === todayISO()) ?? nextData.workouts[0];
      setSelectedWorkoutId(nextWorkout?.id ?? '');
      setBackupMessage(`已导入 ${nextData.workouts.length} 条训练记录。`);
    } catch {
      setBackupMessage('导入失败，请选择 Iron Ledger 的备份 JSON 文件。');
    }
  };

  const renderToday = () => {
    if (!todayWorkout) return null;
    return (
      <div className="screen space-y-6">
        <Panel className="p-6">
          <div className="text-[15px] font-medium text-[#8E8E93]">{weekday(todayWorkout.date)}</div>
          <h1 className="mt-2 text-[34px] font-semibold leading-tight tracking-[-0.04em] text-white">
            {workoutLabels[todayWorkout.type]}
          </h1>
          <div className="mt-6 divide-y divide-[#252525] border-y border-[#252525]">
            {todayWorkout.exercises.length ? (
              todayWorkout.exercises.map((entry, index) => {
                const last = getLastPerformance(data.workouts, entry, todayWorkout.date, todayWorkout.id);
                return (
                  <div key={entry.id} className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[17px] font-medium text-white">{entry.name}</div>
                        <div className="mt-1 text-sm text-[#8E8E93]">
                          {last ? `上次 ${last.summary}` : entry.primaryMuscle}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <IconButton
                          label="上移"
                          disabled={index === 0}
                          onClick={() => moveExercise(todayWorkout.id, index, -1)}
                        >
                          <ChevronUp size={17} />
                        </IconButton>
                        <IconButton
                          label="下移"
                          disabled={index === todayWorkout.exercises.length - 1}
                          onClick={() => moveExercise(todayWorkout.id, index, 1)}
                        >
                          <ChevronDown size={17} />
                        </IconButton>
                        <IconButton
                          label="删除动作"
                          danger
                          onClick={() =>
                            updateWorkout(todayWorkout.id, (workout) => ({
                              ...workout,
                              exercises: workout.exercises.filter((candidate) => candidate.id !== entry.id),
                            }))
                          }
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-sm text-[#8E8E93]">选择模板或手动添加动作。</div>
            )}
          </div>
          <Button
            className="mt-6 w-full"
            variant="primary"
            onClick={() => {
              setSelectedWorkoutId(todayWorkout.id);
              setActiveTab('record');
            }}
          >
            <Play size={17} />
            开始训练
          </Button>
        </Panel>

        <Panel className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <FieldLabel>日期</FieldLabel>
              <TextInput
                type="date"
                value={todayWorkout.date}
                onChange={(event) =>
                  updateWorkout(todayWorkout.id, (workout) => ({ ...workout, date: event.target.value }))
                }
              />
            </div>
            <div className="min-w-0 space-y-2">
              <FieldLabel>类型</FieldLabel>
              <SelectInput
                value={todayWorkout.type}
                onChange={(event) =>
                  updateWorkout(todayWorkout.id, (workout) => ({
                    ...workout,
                    type: event.target.value as WorkoutType,
                  }))
                }
              >
                {WORKOUT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {workoutLabels[type]}
                  </option>
                ))}
              </SelectInput>
            </div>
          </div>
          <div className="space-y-2">
            <FieldLabel>模板</FieldLabel>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <SelectInput value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value)}>
                {data.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </SelectInput>
              <Button onClick={applyTemplateToToday}>使用</Button>
            </div>
          </div>
          <div className="space-y-2">
            <FieldLabel>添加动作</FieldLabel>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <SelectInput value={exerciseChoice} onChange={(event) => setExerciseChoice(event.target.value)}>
                {visibleExercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </SelectInput>
              <Button onClick={() => addExerciseToWorkout(todayWorkout.id, exerciseChoice)}>
                <Plus size={16} />
                添加
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    );
  };

  const renderRecord = () => {
    if (!selectedWorkout) return null;
    const totals = workoutTotals(selectedWorkout);

    return (
      <div className="screen space-y-6">
        <div className="px-1">
          <div className="text-sm text-[#8E8E93]">{fullDate(selectedWorkout.date)}</div>
          <div className="mt-1 flex items-end justify-between gap-4">
            <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-white">
              {workoutLabels[selectedWorkout.type]}
            </h1>
            <button
              type="button"
              onClick={() =>
                updateWorkout(selectedWorkout.id, (workout) => ({ ...workout, completed: !workout.completed }))
              }
              className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-white"
            >
              <Check size={16} />
              {selectedWorkout.completed ? '已完成' : '完成训练'}
            </button>
          </div>
          <div className="mt-4 flex gap-8">
            <NumberStat label="组数" value={`${totals.totalSets}`} />
            <NumberStat label="容量" value={`${fmt(totals.volume)} lb`} />
          </div>
        </div>

        {selectedWorkout.exercises.length === 0 ? (
          <Panel>
            <p className="text-sm text-[#8E8E93]">还没有动作，请从今日训练添加。</p>
          </Panel>
        ) : (
          selectedWorkout.exercises.map((entry) => {
            const last = getLastPerformance(data.workouts, entry, selectedWorkout.date, selectedWorkout.id);
            return (
              <Panel key={entry.id} className="space-y-5">
                <div>
                  <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-white">{entry.name}</h2>
                  <div className="mt-3 grid grid-cols-[72px_1fr] gap-4 border-y border-[#252525] py-3">
                    <div className="text-sm text-[#8E8E93]">上次</div>
                    <div className="text-right text-[17px] font-medium text-white">{last?.summary ?? '暂无记录'}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {entry.sets.map((set, setIndex) => (
                    <div key={set.id} className="rounded-[22px] border border-[#252525] bg-[#101010] p-3">
                      <div className="grid grid-cols-[42px_1fr_78px_1fr_auto] items-center gap-2">
                        <div className="text-sm text-[#8E8E93]">{setIndex + 1}</div>
                        <TextInput
                          className="h-13 text-center text-xl font-semibold tracking-[-0.03em]"
                          type="number"
                          inputMode="decimal"
                          value={set.weight}
                          onChange={(event) =>
                            updateSet(selectedWorkout.id, entry.id, set.id, (current) => ({
                              ...current,
                              weight: toNumber(event.target.value),
                            }))
                          }
                          aria-label="重量"
                        />
                        <SelectInput
                          className="h-13 px-2 text-center"
                          value={set.unit}
                          onChange={(event) =>
                            updateSet(selectedWorkout.id, entry.id, set.id, (current) => ({
                              ...current,
                              unit: event.target.value as Unit,
                            }))
                          }
                          aria-label="单位"
                        >
                          <option value="lb">lb</option>
                          <option value="kg">kg</option>
                        </SelectInput>
                        <TextInput
                          className="h-13 text-center text-xl font-semibold tracking-[-0.03em]"
                          type="number"
                          inputMode="numeric"
                          value={set.reps}
                          onChange={(event) =>
                            updateSet(selectedWorkout.id, entry.id, set.id, (current) => ({
                              ...current,
                              reps: toNumber(event.target.value),
                            }))
                          }
                          aria-label="次数"
                        />
                        <IconButton
                          label="删除组"
                          danger
                          onClick={() =>
                            updateExerciseEntry(selectedWorkout.id, entry.id, (current) => ({
                              ...current,
                              sets: current.sets.filter((candidate) => candidate.id !== set.id),
                            }))
                          }
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm text-[#8E8E93]">
                          <input
                            type="checkbox"
                            checked={set.isWarmup ?? false}
                            onChange={(event) =>
                              updateSet(selectedWorkout.id, entry.id, set.id, (current) => ({
                                ...current,
                                isWarmup: event.target.checked,
                              }))
                            }
                          />
                          热身组
                        </label>
                        <TextInput
                          className="h-10 w-24 text-center text-sm"
                          type="number"
                          inputMode="decimal"
                          value={set.rpe ?? ''}
                          placeholder="RPE"
                          onChange={(event) =>
                            updateSet(selectedWorkout.id, entry.id, set.id, (current) => ({
                              ...current,
                              rpe: event.target.value ? toNumber(event.target.value) : undefined,
                            }))
                          }
                        />
                      </div>
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {QUICK_WEIGHTS.map((weight) => (
                          <button
                            type="button"
                            key={weight}
                            onClick={() =>
                              updateSet(selectedWorkout.id, entry.id, set.id, (current) => ({
                                ...current,
                                weight,
                                unit: 'lb',
                              }))
                            }
                            className="shrink-0 rounded-full border border-[#252525] px-3 py-1.5 text-xs text-[#D1D1D6]"
                          >
                            {weight} lb
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                        {QUICK_REPS.map((reps) => (
                          <button
                            type="button"
                            key={reps}
                            onClick={() =>
                              updateSet(selectedWorkout.id, entry.id, set.id, (current) => ({ ...current, reps }))
                            }
                            className="shrink-0 rounded-full border border-[#252525] px-3 py-1.5 text-xs text-[#D1D1D6]"
                          >
                            {reps} 次
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      updateExerciseEntry(selectedWorkout.id, entry.id, (current) => ({
                        ...current,
                        sets: [...current.sets, createSet(current.sets[0]?.unit ?? 'lb')],
                      }))
                    }
                  >
                    <Plus size={16} />
                    添加一组
                  </Button>
                  <Button onClick={() => duplicateLastSet(selectedWorkout.id, entry)}>
                    <Copy size={16} />
                    复制上一组
                  </Button>
                </div>

                <TextArea
                  rows={2}
                  value={entry.notes ?? ''}
                  placeholder="备注"
                  onChange={(event) =>
                    updateExerciseEntry(selectedWorkout.id, entry.id, (current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </Panel>
            );
          })
        )}
      </div>
    );
  };

  const renderHistory = () => {
    const filtered = [...data.workouts]
      .filter((workout) => workout.completed || workout.exercises.length > 0)
      .filter((workout) => historyType === '全部' || workout.type === historyType)
      .filter((workout) =>
        historySearch.trim()
          ? workout.exercises.some((exercise) => exercise.name.includes(historySearch.trim()))
          : true,
      )
      .sort((a, b) => b.date.localeCompare(a.date));

    return (
      <div className="screen space-y-5">
        <PageTitle title="历史记录" subtitle="按日期查看训练，支持搜索动作、筛选类型和修改旧记录。" />
        <Panel className="space-y-3">
          <div className="grid grid-cols-[1fr_126px] gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#636366]" size={17} />
              <TextInput
                className="pl-11"
                value={historySearch}
                placeholder="搜索动作"
                onChange={(event) => setHistorySearch(event.target.value)}
              />
            </div>
            <SelectInput value={historyType} onChange={(event) => setHistoryType(event.target.value as WorkoutType | '全部')}>
              <option value="全部">全部</option>
              {WORKOUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {workoutLabels[type]}
                </option>
              ))}
            </SelectInput>
          </div>
        </Panel>

        {filtered.map((workout) => {
          const totals = workoutTotals(workout);
          return (
            <Panel key={workout.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[17px] font-semibold text-white">{fullDate(workout.date)}</div>
                  <div className="mt-1 text-sm text-[#8E8E93]">
                    {workoutLabels[workout.type]} · {workout.exercises.length} 个动作 · {totals.totalSets} 组
                  </div>
                  <div className="mt-2 text-sm text-[#D1D1D6]">{fmt(totals.volume)} lb 总容量</div>
                </div>
                <div className="flex gap-2">
                  <IconButton
                    label="编辑"
                    onClick={() => {
                      setSelectedWorkoutId(workout.id);
                      setActiveTab('record');
                    }}
                  >
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton
                    label="删除"
                    danger
                    onClick={() => {
                      if (!window.confirm(`删除 ${workout.date} 的训练记录？`)) return;
                      setData((current) => ({
                        ...current,
                        workouts: current.workouts.filter((candidate) => candidate.id !== workout.id),
                      }));
                      if (selectedWorkoutId === workout.id) setSelectedWorkoutId(todayWorkout?.id ?? '');
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    );
  };

  const renderLibrary = () => {
    const filtered = visibleExercises
      .filter((exercise) => libraryMuscle === '全部' || exercise.primaryMuscle === libraryMuscle)
      .filter((exercise) =>
        librarySearch.trim() ? exercise.name.toLowerCase().includes(librarySearch.trim().toLowerCase()) : true,
      )
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.primaryMuscle.localeCompare(b.primaryMuscle));

    return (
      <div className="screen space-y-5">
        <PageTitle title="动作库" subtitle="管理常用动作。删除动作不会影响已经保存的历史训练。" />
        <Panel className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">备份</h2>
              <p className="mt-2 text-sm leading-6 text-[#8E8E93]">
                数据保存在这台手机的当前浏览器里。换手机、清理浏览器数据或重新安装前，先导出备份。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportBackup}>
              <Download size={16} />
              导出备份
            </Button>
            <Button onClick={() => backupInputRef.current?.click()}>
              <Upload size={16} />
              导入备份
            </Button>
          </div>
          {backupMessage ? <p className="text-sm text-[#D1D1D6]">{backupMessage}</p> : null}
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void importBackup(file);
            }}
          />
        </Panel>
        <Panel className="space-y-3">
          <div className="grid grid-cols-[1fr_112px] gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#636366]" size={17} />
              <TextInput
                className="pl-11"
                value={librarySearch}
                placeholder="搜索"
                onChange={(event) => setLibrarySearch(event.target.value)}
              />
            </div>
            <SelectInput value={libraryMuscle} onChange={(event) => setLibraryMuscle(event.target.value)}>
              <option value="全部">全部</option>
              {MUSCLES.map((muscle) => (
                <option key={muscle} value={muscle}>
                  {muscle}
                </option>
              ))}
            </SelectInput>
          </div>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">
            {exerciseDraft.id ? '编辑动作' : '新建动作'}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <TextInput
              value={exerciseDraft.name}
              placeholder="动作名称"
              onChange={(event) => setExerciseDraft((draft) => ({ ...draft, name: event.target.value }))}
            />
            <SelectInput
              value={exerciseDraft.primaryMuscle}
              onChange={(event) => setExerciseDraft((draft) => ({ ...draft, primaryMuscle: event.target.value }))}
            >
              {MUSCLES.map((muscle) => (
                <option key={muscle} value={muscle}>
                  {muscle}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              value={exerciseDraft.movementType}
              onChange={(event) =>
                setExerciseDraft((draft) => ({ ...draft, movementType: event.target.value as MovementType }))
              }
            >
              {Object.entries(movementLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              value={exerciseDraft.defaultUnit}
              onChange={(event) => setExerciseDraft((draft) => ({ ...draft, defaultUnit: event.target.value as Unit }))}
            >
              <option value="lb">默认 lb</option>
              <option value="kg">默认 kg</option>
            </SelectInput>
          </div>
          <TextInput
            value={exerciseDraft.secondaryMuscles}
            placeholder="次要肌群，用逗号分隔"
            onChange={(event) => setExerciseDraft((draft) => ({ ...draft, secondaryMuscles: event.target.value }))}
          />
          <TextArea
            rows={2}
            value={exerciseDraft.notes}
            placeholder="备注"
            onChange={(event) => setExerciseDraft((draft) => ({ ...draft, notes: event.target.value }))}
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={saveExerciseDraft}>
              {exerciseDraft.id ? '保存' : '添加'}
            </Button>
            <Button onClick={() => setExerciseDraft(emptyExerciseDraft)}>清空</Button>
          </div>
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((exercise) => (
            <Panel key={exercise.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="truncate text-[17px] font-semibold text-white">{exercise.name}</h3>
                  <p className="mt-1 text-sm text-[#8E8E93]">
                    {exercise.primaryMuscle} · {movementLabels[exercise.movementType]} · {exercise.defaultUnit}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="收藏动作"
                  onClick={() =>
                    setData((current) => ({
                      ...current,
                      exercises: current.exercises.map((candidate) =>
                        candidate.id === exercise.id
                          ? { ...candidate, isFavorite: !candidate.isFavorite }
                          : candidate,
                      ),
                    }))
                  }
                  className={cn(
                    'tap rounded-full border border-[#252525] text-[#8E8E93] transition active:scale-[0.96]',
                    exercise.isFavorite && 'text-white',
                  )}
                >
                  <Star size={17} fill={exercise.isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  onClick={() =>
                    setExerciseDraft({
                      id: exercise.id,
                      name: exercise.name,
                      primaryMuscle: exercise.primaryMuscle,
                      secondaryMuscles: exercise.secondaryMuscles?.join(', ') ?? '',
                      movementType: exercise.movementType,
                      defaultUnit: exercise.defaultUnit,
                      notes: exercise.notes ?? '',
                    })
                  }
                >
                  <Pencil size={16} />
                  编辑
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    setData((current) => ({
                      ...current,
                      exercises: current.exercises.map((candidate) =>
                        candidate.id === exercise.id ? { ...candidate, isArchived: true } : candidate,
                      ),
                    }))
                  }
                >
                  <Trash2 size={16} />
                  删除
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    );
  };

  const renderTemplates = () => (
    <div className="screen space-y-5">
      <PageTitle title="训练模板" subtitle="把常用训练整理成模板，今日训练可以一键生成。" />
      <Panel className="space-y-3">
        <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">
          {templateDraft.id ? '编辑模板' : '新建模板'}
        </h2>
        <TextInput
          value={templateDraft.name}
          placeholder="模板名称"
          onChange={(event) => setTemplateDraft((draft) => ({ ...draft, name: event.target.value }))}
        />
        <TextArea
          rows={2}
          value={templateDraft.notes}
          placeholder="备注"
          onChange={(event) => setTemplateDraft((draft) => ({ ...draft, notes: event.target.value }))}
        />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <SelectInput value={templateExerciseChoice} onChange={(event) => setTemplateExerciseChoice(event.target.value)}>
            {visibleExercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </SelectInput>
          <Button
            onClick={() =>
              setTemplateDraft((draft) => ({
                ...draft,
                exercises: [
                  ...draft.exercises,
                  { exerciseId: templateExerciseChoice, defaultSets: 3, repRange: '8-12' },
                ],
              }))
            }
          >
            <Plus size={16} />
            添加
          </Button>
        </div>
        <div className="space-y-2">
          {templateDraft.exercises.map((item, index) => {
            const exercise = data.exercises.find((candidate) => candidate.id === item.exerciseId);
            return (
              <div key={`${item.exerciseId}-${index}`} className="rounded-[22px] border border-[#252525] bg-[#101010] p-3">
                <div className="mb-2 text-sm font-medium text-white">{exercise?.name ?? '已删除动作'}</div>
                <div className="grid grid-cols-[82px_1fr_auto] gap-2">
                  <TextInput
                    type="number"
                    value={item.defaultSets}
                    onChange={(event) =>
                      setTemplateDraft((draft) => ({
                        ...draft,
                        exercises: draft.exercises.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? { ...candidate, defaultSets: toNumber(event.target.value) }
                            : candidate,
                        ),
                      }))
                    }
                    aria-label="默认组数"
                  />
                  <TextInput
                    value={item.repRange}
                    onChange={(event) =>
                      setTemplateDraft((draft) => ({
                        ...draft,
                        exercises: draft.exercises.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...candidate, repRange: event.target.value } : candidate,
                        ),
                      }))
                    }
                    aria-label="次数范围"
                  />
                  <IconButton
                    label="删除"
                    danger
                    onClick={() =>
                      setTemplateDraft((draft) => ({
                        ...draft,
                        exercises: draft.exercises.filter((_, candidateIndex) => candidateIndex !== index),
                      }))
                    }
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={saveTemplateDraft}>
            {templateDraft.id ? '保存模板' : '创建模板'}
          </Button>
          <Button onClick={() => setTemplateDraft(emptyTemplateDraft)}>清空</Button>
        </div>
      </Panel>

      {data.templates.map((template) => (
        <Panel key={template.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[19px] font-semibold text-white">{template.name}</h3>
              <p className="mt-1 text-sm text-[#8E8E93]">{template.exercises.length} 个动作</p>
            </div>
            <div className="flex gap-2">
              <IconButton
                label="编辑模板"
                onClick={() =>
                  setTemplateDraft({
                    id: template.id,
                    name: template.name,
                    notes: template.notes ?? '',
                    exercises: template.exercises,
                  })
                }
              >
                <Pencil size={16} />
              </IconButton>
              <IconButton
                label="删除模板"
                danger
                onClick={() =>
                  setData((current) => ({
                    ...current,
                    templates: current.templates.filter((candidate) => candidate.id !== template.id),
                  }))
                }
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          </div>
          <div className="mt-4 divide-y divide-[#252525] border-t border-[#252525]">
            {template.exercises.map((item, index) => {
              const exercise = data.exercises.find((candidate) => candidate.id === item.exerciseId);
              return (
                <div key={`${template.id}-${item.exerciseId}-${index}`} className="flex justify-between gap-4 py-3 text-sm">
                  <span className="truncate text-white">{exercise?.name ?? '已删除动作'}</span>
                  <span className="shrink-0 text-[#8E8E93]">
                    {item.defaultSets} × {item.repRange}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      ))}
    </div>
  );

  const renderAnalytics = () => {
    const exercise = visibleExercises.find((candidate) => candidate.id === analysisExerciseId) ?? visibleExercises[0];
    if (!exercise) return null;
    const trend = buildTrend(data.workouts, exercise, exercise.defaultUnit);
    const best = [...trend].sort((a, b) => b.estimated1RM - a.estimated1RM).slice(0, 5);

    return (
      <div className="screen space-y-5">
        <PageTitle title="数据趋势" subtitle="一次只看一个动作，把重量、容量和最佳表现看清楚。" />
        <Panel className="space-y-4">
          <FieldLabel>动作</FieldLabel>
          <SelectInput value={exercise.id} onChange={(event) => setAnalysisExerciseId(event.target.value)}>
            {visibleExercises.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectInput>
          <div className="grid grid-cols-3 gap-5">
            <NumberStat label="次数" value={`${trend.length}`} />
            <NumberStat label="最高" value={`${fmt(Math.max(0, ...trend.map((item) => item.maxWeight)), 1)} ${exercise.defaultUnit}`} />
            <NumberStat label="估算 1RM" value={`${fmt(Math.max(0, ...trend.map((item) => item.estimated1RM)), 1)}`} />
          </div>
        </Panel>

        {trend.length === 0 ? (
          <Panel>
            <p className="text-sm text-[#8E8E93]">完成包含这个动作的训练后，这里会出现趋势。</p>
          </Panel>
        ) : (
          <>
            <ChartPanel title="重量趋势" unit={exercise.defaultUnit}>
              <ReLineChart data={trend} margin={{ top: 12, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid stroke="#252525" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip unit={exercise.defaultUnit} />} />
                <Line
                  type="monotone"
                  dataKey="maxWeight"
                  name="最大重量"
                  stroke="#FFFFFF"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#FFFFFF', strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="estimated1RM"
                  name="估算 1RM"
                  stroke="#8E8E93"
                  strokeWidth={1.5}
                  dot={false}
                />
              </ReLineChart>
            </ChartPanel>

            <ChartPanel title="总容量" unit={exercise.defaultUnit}>
              <AreaChart data={trend} margin={{ top: 12, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid stroke="#252525" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip unit={exercise.defaultUnit} />} />
                <Area
                  type="monotone"
                  dataKey="volume"
                  name="总容量"
                  stroke="#FFFFFF"
                  fill="#FFFFFF"
                  fillOpacity={0.06}
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ChartPanel>

            <Panel>
              <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">近期最佳</h2>
              <div className="mt-4 divide-y divide-[#252525] border-t border-[#252525]">
                {best.map((item) => (
                  <div key={item.workoutId} className="py-4">
                    <div className="flex justify-between gap-4">
                      <span className="font-medium text-white">{item.date}</span>
                      <span className="text-[#D1D1D6]">
                        {fmt(item.estimated1RM, 1)} {exercise.defaultUnit}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-[#8E8E93]">
                      最佳组 {item.bestSet ? `${fmt(convertWeight(item.bestSet.weight, item.bestSet.unit, exercise.defaultUnit), 1)} ${exercise.defaultUnit} × ${item.bestSet.reps}` : '暂无组'} · {fmt(item.volume)} 总容量
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] font-sans text-white">
      <div className="mx-auto min-h-screen w-full max-w-5xl px-5 pb-28 pt-6 sm:px-8 lg:px-10">
        <header className="mb-8 flex items-center justify-between">
          <div className="text-[13px] font-medium text-[#8E8E93]">Iron Ledger</div>
          <div className="flex items-center gap-2 rounded-full border border-[#252525] px-3 py-1.5 text-[12px] text-[#8E8E93]">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            本地已保存
          </div>
        </header>

        <main>
          {activeTab === 'today' && renderToday()}
          {activeTab === 'record' && renderRecord()}
          {activeTab === 'history' && renderHistory()}
          {activeTab === 'library' && renderLibrary()}
          {activeTab === 'analytics' && renderAnalytics()}
          {activeTab === 'templates' && renderTemplates()}
        </main>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-[#252525] bg-[#0A0A0A]/96 px-3 pt-2">
        <div className="mx-auto grid max-w-3xl grid-cols-6 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium transition active:scale-[0.98]',
                  activeTab === item.key ? 'text-white' : 'text-[#636366]',
                )}
              >
                <Icon size={19} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-1">
      <h1 className="text-[32px] font-semibold tracking-[-0.04em] text-white">{title}</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[#8E8E93]">{subtitle}</p>
    </div>
  );
}

function ChartPanel({ title, unit, children }: { title: string; unit: string; children: React.ReactElement }) {
  return (
    <Panel>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">{title}</h2>
        <span className="text-sm text-[#8E8E93]">{unit}</span>
      </div>
      <div className="chart h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-[#252525] bg-[#151515] px-3 py-2 text-sm text-white">
      <div className="mb-1 text-[#8E8E93]">{label}</div>
      {payload.map((item: any) => (
        <div key={item.dataKey} className="flex justify-between gap-5">
          <span>{item.name}</span>
          <span className="font-medium">
            {fmt(Number(item.value), 1)} {item.dataKey === 'totalSets' ? '' : unit}
          </span>
        </div>
      ))}
    </div>
  );
}
