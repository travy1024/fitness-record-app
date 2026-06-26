export type WorkoutType = '胸' | '背' | '肩' | '腿' | '臂' | '休息' | '自定义';

export type Unit = 'kg' | 'lb';

export type MovementType = 'push' | 'pull' | 'squat' | 'hinge' | 'isolation' | 'core' | 'cardio';

export type WorkoutSet = {
  id: string;
  weight: number;
  unit: Unit;
  reps: number;
  rpe?: number;
  isWarmup?: boolean;
};

export type WorkoutExercise = {
  id: string;
  exerciseId?: string;
  name: string;
  primaryMuscle: string;
  sets: WorkoutSet[];
  notes?: string;
};

export type Workout = {
  id: string;
  date: string;
  type: WorkoutType;
  exercises: WorkoutExercise[];
  notes?: string;
  completed: boolean;
};

export type Exercise = {
  id: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string[];
  movementType: MovementType;
  defaultUnit: Unit;
  notes?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  exercises: TemplateExercise[];
  notes?: string;
};

export type TemplateExercise = {
  exerciseId: string;
  defaultSets: number;
  repRange: string;
  notes?: string;
};

export type AppData = {
  version: number;
  workouts: Workout[];
  exercises: Exercise[];
  templates: WorkoutTemplate[];
};
