import type { AppData, Exercise, MovementType, Unit, Workout, WorkoutTemplate, WorkoutType } from './types';

export const STORAGE_KEY = 'iron-ledger-data-v1';
export const WORKOUT_TYPES: WorkoutType[] = ['胸', '背', '肩', '腿', '臂', '休息', '自定义'];
export const QUICK_WEIGHTS = [5, 10, 15, 20, 30, 35, 40];
export const QUICK_REPS = [6, 8, 10, 12, 15, 20];
export const MUSCLES = ['胸', '背', '肩', '腿', '手臂', '核心', '有氧'];

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todayISO(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

const movementForMuscle = (muscle: string, name: string): MovementType => {
  if (muscle === '胸') return 'push';
  if (muscle === '背') return 'pull';
  if (muscle === '核心') return 'core';
  if (muscle === '有氧') return 'cardio';
  if (name.includes('硬拉') || name.includes('臀桥')) return 'hinge';
  if (name.includes('深蹲') || name.includes('腿举') || name.includes('弓步')) return 'squat';
  if (name.includes('肩推') || name.includes('推举') || name.includes('卧推')) return 'push';
  return 'isolation';
};

const exerciseSeed: Array<{ muscle: string; names: string[]; favorite?: string[] }> = [
  {
    muscle: '胸',
    favorite: ['平板哑铃卧推', '上斜哑铃卧推', '哑铃飞鸟'],
    names: [
      '平板哑铃卧推',
      '上斜哑铃卧推',
      '下斜哑铃卧推',
      '杠铃卧推',
      '上斜杠铃卧推',
      '哑铃飞鸟',
      '绳索夹胸',
      '器械夹胸',
      '双杠臂屈伸',
      '俯卧撑',
    ],
  },
  {
    muscle: '背',
    favorite: ['引体向上', '高位下拉', '单臂哑铃划船'],
    names: [
      '引体向上',
      '高位下拉',
      '单臂哑铃划船',
      '俯身哑铃划船',
      '杠铃划船',
      '坐姿划船',
      'T杠划船',
      '直臂下压',
      '哑铃 Pullover',
      '面拉',
      '反向飞鸟',
    ],
  },
  {
    muscle: '肩',
    favorite: ['哑铃肩推', '哑铃侧平举', '俯身后束飞鸟'],
    names: [
      '哑铃肩推',
      '杠铃肩推',
      '阿诺德推举',
      '哑铃侧平举',
      '绳索侧平举',
      '哑铃前平举',
      '俯身后束飞鸟',
      '反向蝴蝶机',
      '面拉',
    ],
  },
  {
    muscle: '腿',
    favorite: ['深蹲', '罗马尼亚硬拉', '腿举'],
    names: ['深蹲', '高脚杯深蹲', '腿举', '保加利亚分腿蹲', '弓步蹲', '罗马尼亚硬拉', '硬拉', '腿弯举', '腿屈伸', '臀桥', '小腿提踵'],
  },
  {
    muscle: '手臂',
    favorite: ['哑铃弯举', '锤式弯举', '绳索下压'],
    names: ['哑铃弯举', '杠铃弯举', '锤式弯举', '牧师凳弯举', '绳索弯举', '窄距卧推', '过顶臂屈伸', '绳索下压', '仰卧臂屈伸'],
  },
  {
    muscle: '核心',
    favorite: ['平板支撑', '悬垂举腿'],
    names: ['卷腹', '绳索卷腹', '悬垂举腿', '仰卧举腿', '平板支撑', '死虫', 'Russian Twist'],
  },
  {
    muscle: '有氧',
    favorite: ['爬坡走', '跑步'],
    names: ['爬坡走', '跑步', '椭圆机', '动感单车', '跳绳'],
  },
];

export const DEFAULT_EXERCISES: Exercise[] = exerciseSeed.flatMap((group) =>
  group.names.map((name) => ({
    id: `ex-${name.replace(/\s+/g, '-').toLowerCase()}`,
    name,
    primaryMuscle: group.muscle,
    secondaryMuscles: [],
    movementType: movementForMuscle(group.muscle, name),
    defaultUnit: 'lb' as Unit,
    notes: '',
    isFavorite: group.favorite?.includes(name) ?? false,
    isArchived: false,
  })),
);

const exId = (name: string) => DEFAULT_EXERCISES.find((exercise) => exercise.name === name)?.id ?? `missing-${name}`;

export const DEFAULT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'tpl-chest',
    name: '胸日',
    notes: '先推后夹，最后俯卧撑收尾。',
    exercises: [
      { exerciseId: exId('平板哑铃卧推'), defaultSets: 4, repRange: '6-12' },
      { exerciseId: exId('上斜哑铃卧推'), defaultSets: 4, repRange: '8-12' },
      { exerciseId: exId('哑铃飞鸟'), defaultSets: 3, repRange: '10-15' },
      { exerciseId: exId('俯卧撑'), defaultSets: 3, repRange: '力竭' },
    ],
  },
  {
    id: 'tpl-back',
    name: '背日',
    exercises: [
      { exerciseId: exId('引体向上'), defaultSets: 4, repRange: '6-10' },
      { exerciseId: exId('高位下拉'), defaultSets: 4, repRange: '8-12' },
      { exerciseId: exId('单臂哑铃划船'), defaultSets: 4, repRange: '8-12' },
      { exerciseId: exId('坐姿划船'), defaultSets: 3, repRange: '10-15' },
      { exerciseId: exId('面拉'), defaultSets: 3, repRange: '12-20' },
    ],
  },
  {
    id: 'tpl-shoulder',
    name: '肩日',
    exercises: [
      { exerciseId: exId('哑铃肩推'), defaultSets: 4, repRange: '6-12' },
      { exerciseId: exId('哑铃侧平举'), defaultSets: 4, repRange: '12-20' },
      { exerciseId: exId('俯身后束飞鸟'), defaultSets: 3, repRange: '12-20' },
      { exerciseId: exId('阿诺德推举'), defaultSets: 3, repRange: '8-12' },
    ],
  },
  {
    id: 'tpl-leg',
    name: '腿日',
    exercises: [
      { exerciseId: exId('深蹲'), defaultSets: 4, repRange: '5-10' },
      { exerciseId: exId('罗马尼亚硬拉'), defaultSets: 4, repRange: '8-12' },
      { exerciseId: exId('腿举'), defaultSets: 4, repRange: '10-15' },
      { exerciseId: exId('腿弯举'), defaultSets: 3, repRange: '10-15' },
      { exerciseId: exId('小腿提踵'), defaultSets: 4, repRange: '12-20' },
    ],
  },
  {
    id: 'tpl-arm',
    name: '臂日',
    exercises: [
      { exerciseId: exId('哑铃弯举'), defaultSets: 4, repRange: '8-12' },
      { exerciseId: exId('锤式弯举'), defaultSets: 3, repRange: '10-15' },
      { exerciseId: exId('窄距卧推'), defaultSets: 4, repRange: '6-12' },
      { exerciseId: exId('绳索下压'), defaultSets: 3, repRange: '10-15' },
      { exerciseId: exId('过顶臂屈伸'), defaultSets: 3, repRange: '10-15' },
    ],
  },
  {
    id: 'tpl-custom',
    name: '自定义训练',
    exercises: [],
  },
];

export function createWorkout(date = todayISO(), type: WorkoutType = '自定义'): Workout {
  return {
    id: uid('workout'),
    date,
    type,
    exercises: [],
    notes: '',
    completed: false,
  };
}

export function createInitialData(): AppData {
  return {
    version: 1,
    exercises: DEFAULT_EXERCISES,
    templates: DEFAULT_TEMPLATES,
    workouts: [createWorkout()],
  };
}

export function loadData(): AppData {
  if (typeof window === 'undefined') return createInitialData();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialData();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const workouts = Array.isArray(parsed.workouts) ? parsed.workouts : [];
    const today = todayISO();
    const hasToday = workouts.some((workout) => workout.date === today);
    return {
      version: 1,
      exercises: parsed.exercises?.length ? parsed.exercises : DEFAULT_EXERCISES,
      templates: parsed.templates?.length ? parsed.templates : DEFAULT_TEMPLATES,
      workouts: hasToday ? workouts : [createWorkout(today), ...workouts],
    };
  } catch {
    return createInitialData();
  }
}

export function saveData(data: AppData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
