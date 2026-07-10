export interface Assessor {
  id: string;
  name: string;
  sector: "público" | "privado 1" | "privado 2" | "privado 3" | "crime";
  dailyGoal?: number;
  matricula?: string;

}

export interface ProductivityEntry {
  id: string;
  assessorId?: string;
  estagiarioId?: string;
  date: string; // YYYY-MM-DD
  count: number;
}
