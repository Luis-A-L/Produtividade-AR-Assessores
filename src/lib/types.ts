export interface Assessor {
  id: string; // Ex: '1'
  name: string; // Ex: 'Gustavo Arruda'
  period?: "matutino" | "vespertino";
  isActive?: boolean;
  sector: "público" | "privado 1" | "privado 2" | "privado 3" | "crime";
  dailyGoal?: number;
  matricula?: string;
  semanaProva?: boolean;
}

export interface ProductivityEntry {
  id: string; // Ex: '1_2024-05-18' (assessorId_date)
  assessorId?: string;
  estagiarioId?: string;
  date: string; // Format: YYYY-MM-DD
  count: number;
  typeBreakdown?: Record<string, number>; // Ex: { CV: 5, RCV: 3, DCV: 2, CR: 1, RCR: 0, DCR: 0 }
}

export const INITIAL_ASSESSORES: Assessor[] = [];
