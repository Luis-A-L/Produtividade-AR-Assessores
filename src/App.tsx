import React, { useState, useEffect, useMemo } from "react";
import {
  db,
  doc,
  setDoc,
  collection,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  writeBatch,
  query,
  where,
  googleSignIn,
  logout,
  initAuth,
  getAccessToken,
  seedDatabaseIfEmpty,
  batchUpsertAssessores as batchUpsertEstagiarios,
  batchUpsertEntries,
  subscribeToAssessores as subscribeToEstagiarios,
  subscribeToSettings,
} from "./lib/stubs";
import { fetchSheetDataDirectly, getSession, supabase } from "./lib/supabase";
import { Assessor as Estagiario, ProductivityEntry, INITIAL_ASSESSORES as INITIAL_ESTAGIARIOS } from "./lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import {
  Plus,
  Users,
  TrendingUp,
  Calendar,
  ArrowRight,
  Search,
  Trash2,
  Edit3,
  Grid,
  List,
  Check,
  Clock,
  CalendarDays,
  UserPlus,
  X,
  Award,
  Sliders,
  HelpCircle,
  FileText,
  BarChart2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Bell,
  Zap,
  Lock,

  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

let lastAutomationTriggerTime = 0;

export default function App() {
  // Date Helpers
  const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const getCurrentDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const [estagiarios, setEstagiarios] = useState<Estagiario[]>([]);
  const [entries, setEntries] = useState<ProductivityEntry[]>([]);

  const estagiariosRef = React.useRef(estagiarios);
  const entriesRef = React.useRef(entries);

  useEffect(() => {
    estagiariosRef.current = estagiarios;
  }, [estagiarios]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Normalização de lançamentos: agrupa entradas por estagiário+data (sem lógica de origem)
  const normalizedEntries = useMemo(() => {
    const groups: Record<string, {
      id: string;
      estagiarioId: string;
      date: string;
      count: number;
      typeBreakdown: Record<string, number>;
    }> = {};

    entries.forEach((e) => {
      if (!e || !e.estagiarioId || !e.date) return;

      const key = `${e.estagiarioId}_${e.date}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          estagiarioId: e.estagiarioId,
          date: e.date,
          count: 0,
          typeBreakdown: {},
        };
      }
      groups[key].count += e.count;

      if (e.typeBreakdown) {
        Object.entries(e.typeBreakdown).forEach(([type, count]) => {
          groups[key].typeBreakdown[type] = (groups[key].typeBreakdown[type] || 0) + Number(count);
        });
      }
    });

    return Object.values(groups) as Array<ProductivityEntry>;
  }, [entries]);

  const [loading, setLoading] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<"dashboard" | "matrix" | "desempenho" | "diario">(
    "dashboard",
  );
  const [teamSortConfig, setTeamSortConfig] = useState<{
    key: string;
    dir: "asc" | "desc";
  }>({ key: "totalAnalyzed", dir: "desc" });

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [filterQuery, setFilterQuery] = useState<string>("");

  // Modals & Drawers
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState<boolean>(false);
  const [isAddEstagiarioOpen, setIsAddEstagiarioOpen] =
    useState<boolean>(false);
  const [selectedEstagiarioDetail, setSelectedEstagiarioDetail] = useState<
    string | null
  >(null);
  const [selectedSectorDetail, setSelectedSectorDetail] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSectorDetail(null);
  }, [activeTab]);

  // Form State - New Entry
  const [formEstagiarioId, setFormEstagiarioId] = useState<string>("");
  const [formDate, setFormDate] = useState<string>(getCurrentDate());
  const [formCount, setFormCount] = useState<number>(0);
  const [formEditingId, setFormEditingId] = useState<string | null>(null);

  // Form State - New Estagiario
  const [newEstagiarioName, setNewEstagiarioName] = useState<string>("");
  const [newEstagiarioId, setNewEstagiarioId] = useState<string>("");
  const [newEstagiarioRole, setNewEstagiarioRole] =
    useState<string>("público");
  const [newEstagiarioDailyGoal, setNewEstagiarioDailyGoal] =
    useState<number>(25);
  const [newEstagiarioMatricula, setNewEstagiarioMatricula] =
    useState<string>("");

  // Edit Estagiario Cadastre state
  const [isEditingCadastre, setIsEditingCadastre] = useState<boolean>(false);
  const [editEstagiarioName, setEditEstagiarioName] = useState<string>("");
  const [editEstagiarioRole, setEditEstagiarioRole] =
    useState<string>("público");
  const [editEstagiarioDailyGoal, setEditEstagiarioDailyGoal] =
    useState<number>(25);
  const [editEstagiarioMatricula, setEditEstagiarioMatricula] =
    useState<string>("");

  // Loading & Seeding Status
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Google Sheets Sync State
  const DEFAULT_SHEET_URL =
    "https://docs.google.com/spreadsheets/d/17MlkyQC2GnrK2f-mxZQZusv7hORoBZRQpcVAT6bbRIQ/edit?gid=1254289010#gid=1254289010";
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState<boolean>(false);
  const [spreadsheetUrl, setSpreadsheetUrl] =
    useState<string>(DEFAULT_SHEET_URL);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [syncingSheets, setSyncingSheets] = useState<boolean>(false);
  const [syncDuration, setSyncDuration] = useState<number>(0);
  const [lastSyncDuration, setLastSyncDuration] = useState<number | null>(null);

  const formatLastSyncTime = (isoString: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch (e) {
      return "";
    }
  };



  const [previewEntries, setPreviewEntries] = useState<
    Omit<ProductivityEntry, "id">[]
  >([]);
  const [previewEstagiariosToCreate, setPreviewEstagiariosToCreate] = useState<
    string[]
  >([]);
  const [previewEstagiariosDetailed, setPreviewEstagiariosDetailed] = useState<
    Estagiario[]
  >([]);
  const [sheetsMessage, setSheetsMessage] = useState<string>("");
  const [sheetSyncError, setSheetSyncError] = useState<string>("");
  const [pasteDataText, setPasteDataText] = useState<string>("");
  const [selectedSheetName, setSelectedSheetName] = useState<string>("Dados-GR");


  const [detailTab, setDetailTab] = useState<"month" | "day">("month");
  const [detailedProcesses, setDetailedProcesses] = useState<Record<string, { origem: string; date: string; timestamp: string }>>({});
  const [loadingProcesses, setLoadingProcesses] = useState<boolean>(false);

  // Redistribuição de processos
  const [isRedistributeOpen, setIsRedistributeOpen] = useState<boolean>(false);
  const [redistributeFromId, setRedistributeFromId] = useState<string>("");
  const [redistributeDate, setRedistributeDate] = useState<string>(getCurrentDate());
  const [redistributeCount, setRedistributeCount] = useState<number>(0);

  // Processos detalhados agregados de toda a equipe no mês
  const [allDetailedProcesses, setAllDetailedProcesses] = useState<Record<string, Record<string, { origem: string; date: string }>>>({});

  // Toast notification state and safe non-blocking iframe-friendly alert shadowing
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info",
  ) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev && prev.message === message ? null : prev));
    }, 6000);
  };

  const alert = (message: string) => {
    let type: "success" | "error" | "info" = "info";
    const lower = message.toLowerCase();
    if (
      lower.includes("sucesso") ||
      lower.includes("concluído") ||
      lower.includes("salvo") ||
      lower.includes("sincronizados") ||
      lower.includes("removido")
    ) {
      type = "success";
    } else if (
      lower.includes("erro") ||
      lower.includes("falha") ||
      lower.includes("inválida") ||
      lower.includes("atenção") ||
      lower.includes("não foi possível") ||
      lower.includes("já existe")
    ) {
      type = "error";
    }
    showToast(message, type);
  };

  // Google Auth integration states
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [hasAutoSyncedOnStartup, setHasAutoSyncedOnStartup] =
    useState<boolean>(false);
  const [hasSpreadsheetAccess, setHasSpreadsheetAccess] = useState<
    boolean | null
  >(null);
  const [selectedDetailDate, setSelectedDetailDate] = useState<string>(getCurrentDate());

  // Notifications
  const previousTodayCounts = React.useRef<Record<string, number>>({});
  const maxNotifiedCounts = React.useRef<Record<string, number>>({});
  const [notifications, setNotifications] = useState<any[]>([]);

  // Pagination
  const [historyPage, setHistoryPage] = useState<number>(1);
  const itemsPerPage = 15;

  // Monitor Firebase Auth status
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        setIsAuthLoading(false);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
        setHasSpreadsheetAccess(null);
        setIsAuthLoading(false);
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingInGoogle(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
        // If there's an existing URL, sync it instantly!
        if (spreadsheetUrl) {
          triggerSheetsSync(spreadsheetUrl, estagiarios);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(
        "Falha ao se conectar com a conta do Google: " + (err.message || err),
      );
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setGoogleUser(null);
    setGoogleToken(null);
  };

  const handleMockLogin = () => {
    const mockUser = {
      id: "mock_developer",
      email: "desenvolvedor@tjpr.jus.br",
      user_metadata: {
        full_name: "Desenvolvedor Local",
      }
    };
    setGoogleUser(mockUser as any);
    setGoogleToken("mock_token");
    setHasSpreadsheetAccess(true);
    showToast("Conectado em modo de teste!", "success");
  };

  // Time Tracker Effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update selectedDetailDate when selectedMonth changes
  useEffect(() => {
    const today = getCurrentDate();
    if (today.startsWith(selectedMonth)) {
      setSelectedDetailDate(today);
    } else {
      setSelectedDetailDate(`${selectedMonth}-01`);
    }
  }, [selectedMonth]);

  // Initialize edit fields when an estagiario is selected
  useEffect(() => {
    if (selectedEstagiarioDetail) {
      const detailed = estagiarios.find(
        (a) => a.id === selectedEstagiarioDetail,
      );
      if (detailed) {
        setEditEstagiarioName(detailed.name);
        setEditEstagiarioRole(
          detailed.sector || "público",
        );
        setEditEstagiarioDailyGoal(
          detailed.dailyGoal ?? 25,
        );
      }
      setIsEditingCadastre(false);
    }
  }, [selectedEstagiarioDetail, estagiarios]);


  // Fetch Data
  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. Carregar estagiários
      const SKIP_IDS = new Set(["total", "livre_1", "pietro", "gustavo_dias"]);
      const estagiariosSnap = await getDocs(collection(db, "estagiarios"));
      const estagiariosList: Estagiario[] = [];
      estagiariosSnap.forEach((docSnap) => {
        const estag = { id: docSnap.id, ...docSnap.data() } as Estagiario;
        if (!SKIP_IDS.has(estag.id)) {
          estagiariosList.push(estag);
        }
      });
      estagiariosList.sort((a, b) => a.name.localeCompare(b.name));
      setEstagiarios(estagiariosList);

      // 2. Carregar entradas de produtividade
      const entriesSnap = await getDocs(collection(db, "productivityEntries"));
      const entriesList: ProductivityEntry[] = [];
      entriesSnap.forEach((docSnap) => {
        const data = {
          id: docSnap.id,
          ...docSnap.data(),
        } as ProductivityEntry;
        if (!SKIP_IDS.has(data.estagiarioId)) {
          entriesList.push(data);
        }
      });

      // Garantir o carregamento completo do dia 22/06/2026 (bypass do limite de 1000 do PostgREST)
      try {
        const { data: todayRows } = await supabase
          .from("productivity_entries")
          .select("*")
          .eq("date", "2026-06-22");

        if (todayRows && todayRows.length > 0) {
          todayRows.forEach((row) => {
            let count = row.count;
            // Aplica os valores corretos informados
            if (row.estagiario_id === "henrique") count = 31;
            if (row.estagiario_id === "vinicius") count = 25;
            if (row.estagiario_id === "ademar") count = 56;

            const existingIdx = entriesList.findIndex(
              (e) => e.estagiarioId === row.estagiario_id && e.date === row.date
            );
            if (existingIdx !== -1) {
              entriesList[existingIdx].count = count;
            } else {
              entriesList.push({
                id: row.id,
                estagiarioId: row.estagiario_id,
                date: row.date,
                count: count,
              });
            }
          });
        }
      } catch (errToday) {
        console.error("Erro ao buscar dados específicos de hoje:", errToday);
      }

      setEntries(entriesList);

      // HOTFIX: Salva no Supabase os valores corretos de Henrique (31) e Vinicius (25) se o admin estiver logado
      getSession().then((session) => {
        if (session?.user) {
          const targetDate = "2026-06-22";
          const henriqueEntry = entriesList.find((e) => e.estagiarioId === "henrique" && e.date === targetDate);
          const viniciusEntry = entriesList.find((e) => e.estagiarioId === "vinicius" && e.date === targetDate);
          const ademarEntry = entriesList.find((e) => e.estagiarioId === "ademar" && e.date === targetDate);

          const needsHenriqueFix = !henriqueEntry || henriqueEntry.count !== 31;
          const needsViniciusFix = !viniciusEntry || viniciusEntry.count !== 25;
          const needsAdemarFix = !ademarEntry || ademarEntry.count !== 56;

          if (needsHenriqueFix || needsViniciusFix || needsAdemarFix) {
            console.log("[Hotfix] Gravando correções definitivas do dia 22/06 no Supabase...");
            const corrections = [
              { estagiarioId: "ademar", date: targetDate, count: 56 },
              { estagiarioId: "henrique", date: targetDate, count: 31 },
              { estagiarioId: "vinicius", date: targetDate, count: 25 }
            ];

            batchUpsertEntries(corrections).then(() => {
              console.log("[Hotfix] Banco de dados atualizado com sucesso para 22/06!");
            }).catch((err) => {
              console.error("[Hotfix] Falha ao persistir correções:", err);
            });
          }
        }
      });

      // 3. Carregar configurações da planilha (somente leitura — anon pode ler)
      const settingsSnap = await getDoc(doc(db, "settings", "googleSheet"));
      let activeUrl = DEFAULT_SHEET_URL;
      let autoSync = true;
      let lastSync = "";

      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data();
        activeUrl = settingsData.url || DEFAULT_SHEET_URL;
        autoSync = settingsData.autoSync !== undefined ? settingsData.autoSync : true;
        lastSync = settingsData.lastSync || "";
      }

      // Se a URL do banco estiver desatualizada, forçamos a nova e atualizamos o banco de dados
      if (activeUrl !== DEFAULT_SHEET_URL) {
        activeUrl = DEFAULT_SHEET_URL;
        setDoc(doc(db, "settings", "googleSheet"), {
          url: DEFAULT_SHEET_URL,
          autoSync: autoSync,
          lastSync: lastSync
        }).catch(err => console.error("Erro ao salvar settings da planilha padrão no Supabase:", err));
      }

      setSpreadsheetUrl(activeUrl);
      setAutoSyncEnabled(autoSync);
      // Sempre usa "Dados-GR" — conforme a nova especificação
      setSelectedSheetName("Dados-GR");
      setLastSyncTime(lastSync);

      // Não tenta criar settings se não existir — o usuário autenticado fará isso depois
    } catch (error) {
      console.error("Erro ao carregar dados do Supabase:", error);
    } finally {
      setLoading(false);
    }
  };



  // Google Sheets & Clipboard CSV/TSV Parser (Supports Multiple Tabs: Controle and Estagiários)
  const parseSheetData = (
    rawData: string | { [key: string]: string },
    currentEstagiarios: Estagiario[],
    targetControleSheetName?: string,
  ) => {
    let diagDetalhado = false;
    let diagTypesRowIdx = -1;
    let diagDateColIdx = -1;
    let diagMaxDateCount = 0;
    let diagTotalRows = 0;
    let diagMappedUsers: string[] = [];
    let diagFirstRowDump = "";
    let diagFirstDateRaw = "";
    let diagFirstDateIso = "";
    let debugRows: string[][] = [];
    const SKIP_IDS = new Set(["total", "livre_1", "pietro", "gustavo_dias"]);

    const normalizeText = (text: string) =>
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const findEstagiarioId = (name: string): string | null => {
      const normName = normalizeText(name);
      const found = currentEstagiarios.find(
        (a) => normalizeText(a.name) === normName,
      );
      return found ? found.id : null;
    };

    const translateMonthToNum = (m: string): string => {
      const norm = m
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .substring(0, 3);
      const months: { [key: string]: string } = {
        jan: "01",
        fev: "02",
        mar: "03",
        abr: "04",
        mai: "05",
        jun: "06",
        jul: "07",
        ago: "08",
        set: "09",
        out: "10",
        nov: "11",
        dez: "12",
        "01": "01",
        "02": "02",
        "03": "03",
        "04": "04",
        "05": "05",
        "06": "06",
        "07": "07",
        "08": "08",
        "09": "09",
        "10": "10",
        "11": "11",
        "12": "12",
      };
      return months[norm] || m;
    };

    const parseDateToISO = (dateStr: string): string | null => {
      const getIso = () => {
        if (!dateStr) return null;
        let cleaned = dateStr.trim();

        // Se já estiver no formato YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

        // Procura por DD/MM/YYYY ou DD/MM/YY ou DD-MM-YYYY no início (ex: "25/06/2026-Quinta")
        const slashMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2}|\w{3,4})[\/\-](\d{2,4})/);
        if (slashMatch) {
          const [, day, monthStr, yearStr] = slashMatch;
          const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
          const month = translateMonthToNum(monthStr);
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }

        // Procura por Date(2026,5,25) ou similar (formato retornado pelo Google Visualization API)
        const gvizMatch = cleaned.match(/Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)/i);
        if (gvizMatch) {
          const [, y, m, d] = gvizMatch;
          // O mês no Gviz é 0-indexado (0 = Jan, 5 = Jun)
          const monthVal = String(parseInt(m, 10) + 1).padStart(2, "0");
          return `${y}-${monthVal}-${d.padStart(2, "0")}`;
        }

        // Procura por YYYY/MM/DD ou YYYY-MM-DD no início
        const isoMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (isoMatch) {
          const [, year, month, day] = isoMatch;
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }

        // Caso tenha espaços, tenta pegar o primeiro token
        if (cleaned.includes(" ")) {
          cleaned = cleaned.split(" ")[0].trim();
        }

        // Formato com barras clássico (DD/MM/YYYY)
        const slashParts = cleaned.split("/");
        if (slashParts.length === 3) {
          const [day, monthStr, yearStr] = slashParts;
          const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
          const month = translateMonthToNum(monthStr);
          const padM = month.padStart(2, "0");
          const padD = day.padStart(2, "0");
          if (
            year.length === 4 &&
            !isNaN(parseInt(year, 10)) &&
            !isNaN(parseInt(padM, 10)) &&
            !isNaN(parseInt(padD, 10))
          ) {
            return `${year}-${padM}-${padD}`;
          }
        }

        return null;
      };

      const iso = getIso();
      if (iso === "2026-06-22") return null; // Ignora o dia 22 de junho de 2026 na sincronização
      return iso;
    };

    if (!rawData) {
      return {
        success: false,
        entries: [],
        estagiariosCreated: [],
        estagiariosDetailedToCreate: [],
        message:
          "Nenhum dado legível foi recebido da planilha. Verifique as configurações de compartilhamento.",
      };
    }

    let sheets: { [key: string]: string } = {};
    if (typeof rawData === "string") {
      sheets["Controle Geral"] = rawData;
    } else {
      sheets = rawData || {};
    }

    let estagiariosSheetContent = "";
    let estagiariosSheetName = "";
    const allControleSheets: { name: string; content: string }[] = [];
    const candidateIndividualSheets: { name: string; content: string }[] = [];

    // 1. Identify sheets
    Object.entries(sheets).forEach(([name, content]) => {
      const norm = normalizeText(name);
      // Ignora abas de template/modelo (ex: MODELO GERAL) de onde não precisamos de nenhum dado
      if (norm.includes("modelo") || norm.includes("template")) {
        return;
      }
      // Processa exclusivamente a aba Dados-GR
      if (norm === "dados-gr") {
        allControleSheets.push({ name, content });
      }
    });

    const controleSheets = allControleSheets;

    const estagiariosFromSheet: Estagiario[] = [];
    const estagiariosCreatedTemp: string[] = [];

    const getDelimiter = (csv: string) => {
      const firstLine = csv.split(/\r?\n/)[0] || "";
      if (firstLine.includes("\t")) return "\t";
      if (firstLine.includes(";")) return ";";
      return ",";
    };

    // 2. Process Estagiarios Sheet (Aba dos Estagiários)
    if (estagiariosSheetContent) {
      const eLines = estagiariosSheetContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (eLines.length > 1) {
        const eDelim = getDelimiter(estagiariosSheetContent);
        const eHeaders = eLines[0]
          .split(eDelim)
          .map((h) => h.trim().replace(/^["']|["']$/g, ""));

        let nameColIdx = -1;
        let matriculaColIdx = -1;
        let roleColIdx = -1;
        let goalColIdx = -1;

        for (let i = 0; i < eHeaders.length; i++) {
          const norm = normalizeText(eHeaders[i]);
          if (
            norm.includes("nome") ||
            norm.includes("estagiario") ||
            norm.includes("estagiário") ||
            norm.includes("usuario") ||
            norm.includes("pessoa") ||
            norm.includes("membro")
          ) {
            nameColIdx = i;
          } else if (
            norm.includes("matricula") ||
            norm.includes("matrícula") ||
            norm.includes("numero") ||
            norm.includes("número") ||
            norm.includes("codigo") ||
            norm.includes("código") ||
            norm.includes("id")
          ) {
            matriculaColIdx = i;
          } else if (
            norm.includes("role") ||
            norm.includes("cargo") ||
            norm.includes("categoria") ||
            norm.includes("tipo") ||
            norm.includes("modalidade")
          ) {
            roleColIdx = i;
          } else if (
            norm.includes("meta") ||
            norm.includes("daily") ||
            norm.includes("diaria") ||
            norm.includes("diária") ||
            norm.includes("objetivo")
          ) {
            goalColIdx = i;
          }
        }

        if (nameColIdx === -1) nameColIdx = 0;

        for (let i = 1; i < eLines.length; i++) {
          const cells = eLines[i]
            .split(eDelim)
            .map((c) => c.trim().replace(/^["']|["']$/g, ""));
          if (cells.length <= nameColIdx) continue;

          const rawName = cells[nameColIdx];
          if (!rawName || rawName === "Nome") continue;

          const rawMatricula =
            matriculaColIdx !== -1 && matriculaColIdx < cells.length
              ? cells[matriculaColIdx]
              : "";
          const rawRole =
            roleColIdx !== -1 && roleColIdx < cells.length
              ? cells[roleColIdx]
              : "";
          const rawGoal =
            goalColIdx !== -1 && goalColIdx < cells.length
              ? cells[goalColIdx]
              : "";

          let parsedSector: "público" | "privado 1" | "privado 2" | "privado 3" | "crime" = "público";
          const normRole = normalizeText(rawRole);
          if (normRole.includes("crime")) {
            parsedSector = "crime";
          } else if (normRole.includes("privado 1") || normRole.includes("privado1")) {
            parsedSector = "privado 1";
          } else if (normRole.includes("privado 2") || normRole.includes("privado2")) {
            parsedSector = "privado 2";
          } else if (normRole.includes("privado 3") || normRole.includes("privado3")) {
            parsedSector = "privado 3";
          } else if (normRole.includes("publico")) {
            parsedSector = "público";
          }

          let parsedGoal = 25;
          if (rawGoal) {
            const gNum = parseInt(rawGoal.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(gNum) && gNum > 0) parsedGoal = gNum;
          }

          const computedId = rawName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "");
          if (computedId) {
            if (!estagiariosFromSheet.some((x) => x.id === computedId)) {
              estagiariosFromSheet.push({
                id: computedId,
                name: rawName,
                sector: parsedSector,
                dailyGoal: parsedGoal,
                matricula: rawMatricula ? rawMatricula.trim() : "",
              });
            }
          }
        }
      }
    }

    // Combine current with sheet estagiarios for matching IDs during parsing
    const combinedCurrentAndSheetEstagiarios = [...currentEstagiarios];
    estagiariosFromSheet.forEach((sheetEstag) => {
      const idx = combinedCurrentAndSheetEstagiarios.findIndex(
        (e) => e.id === sheetEstag.id,
      );
      if (idx !== -1) {
        combinedCurrentAndSheetEstagiarios[idx] = {
          ...combinedCurrentAndSheetEstagiarios[idx],
          sector: sheetEstag.sector || combinedCurrentAndSheetEstagiarios[idx].sector,
          dailyGoal:
            sheetEstag.dailyGoal ||
            combinedCurrentAndSheetEstagiarios[idx].dailyGoal,
          matricula:
            sheetEstag.matricula ||
            combinedCurrentAndSheetEstagiarios[idx].matricula,
        };
      } else {
        combinedCurrentAndSheetEstagiarios.push(sheetEstag);
      }
    });

    const parsedEntries: Omit<ProductivityEntry, "id">[] = [];

    const findEstagiarioIdLocal = (name: string): string | null => {
      const normName = normalizeText(name);
      const found = combinedCurrentAndSheetEstagiarios.find(
        (a) => normalizeText(a.name) === normName,
      );
      return found ? found.id : null;
    };

    const parsedDetailedProcesses: Array<{
      estagiarioId: string;
      date: string;
      numeroProcesso: string;
      origem: string;
    }> = [];

    // Identificar abas individuais reais vinculando aos estagiarios
    const individualSheetsProcessed: { estagiarioId: string; content: string; name: string }[] = [];
    const individualEstagiarioIds = new Set<string>();

    candidateIndividualSheets.forEach(({ name, content }) => {
      const estagId = findEstagiarioIdLocal(name);
      if (estagId) {
        individualSheetsProcessed.push({ estagiarioId: estagId, content, name });
        individualEstagiarioIds.add(estagId);
      }
    });

    // Processar abas individuais
    individualSheetsProcessed.forEach(({ estagiarioId, content, name }) => {
      if (!content) return;
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length <= 1) return;

      const delimiter = getDelimiter(content);
      const rows = lines.map((line) =>
        line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""))
      );

      // Achar cabeçalho: Data, Nº do Processo (ou Processo), Origem
      let dateColIdx = -1;
      let procColIdx = -1;
      let origemColIdx = -1;
      let headerRowIdx = -1;

      for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const row = rows[r].map((h) => normalizeText(h || ""));
        const dIdx = row.findIndex((h) => h === "data" || h.includes("data"));
        const pIdx = row.findIndex((h) => h.includes("processo") || h.includes("nº"));
        const oIdx = row.findIndex((h) => h === "origem" || h.includes("origem"));

        if (dIdx !== -1 && pIdx !== -1) {
          dateColIdx = dIdx;
          procColIdx = pIdx;
          origemColIdx = oIdx;
          headerRowIdx = r;
          break;
        }
      }

      if (dateColIdx === -1) {
        dateColIdx = 0;
        procColIdx = 1;
        origemColIdx = 2;
        headerRowIdx = 1;
      }

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (dateColIdx >= row.length) continue;

        const rawDate = row[dateColIdx] || "";
        const isoDate = parseDateToISO(rawDate);
        if (!isoDate || isoDate < "2026-04-01") continue;

        const rawProc = procColIdx !== -1 && procColIdx < row.length ? row[procColIdx].trim() : "";
        const rawOrigem = origemColIdx !== -1 && origemColIdx < row.length ? row[origemColIdx].trim() : "";
        const normOrigem = rawOrigem.toLowerCase();

        if (!rawProc) continue;

        parsedEntries.push({
          estagiarioId,
          date: isoDate,
          count: 1, // Cada linha de processo representa 1!
        });

        parsedDetailedProcesses.push({
          estagiarioId,
          date: isoDate,
          numeroProcesso: rawProc,
          origem: normOrigem.toUpperCase() || "CV",
        });
      }
    });

    // 3. Process Controle (Cases) Sheets
    controleSheets.forEach(({ name: cName, content: cContent }) => {
      if (!cContent) return;
      const lines = cContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length <= 1) return;

      const delimiter = getDelimiter(cContent);

      const parseCSVLine = (lineStr: string, delim: string): string[] => {
        const tokens: string[] = [];
        let cur = "";
        let inQ = false;
        for (let i = 0; i < lineStr.length; i++) {
          const c = lineStr[i];
          if (c === '"') {
            if (inQ && lineStr[i+1] === '"') {
              cur += '"';
              i++;
            } else {
              inQ = !inQ;
            }
          } else if (c === delim && !inQ) {
            tokens.push(cur.trim());
            cur = "";
          } else {
            cur += c;
          }
        }
        tokens.push(cur.trim());
        return tokens;
      };

      const rows = lines.map((line) =>
        parseCSVLine(line, delimiter).map((c) => c.trim().replace(/^["']|["']$/g, "")),
      );

      debugRows = rows.slice(0, 15);

      const normalizeTypeCode = (code: string): string => {
        return (code || "")
          .replace(/[^a-zA-Z]/g, "")
          .toUpperCase();
      };

      // Encontrar a linha de cabeçalho
      let headerRowIdx = -1;
      let assessorColIdx = -1;
      let grupoColIdx = -1;
      const dayColsMap: { [day: number]: number } = {};

      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r].map(h => normalizeText(h || ""));
        const assIdx = row.findIndex(h => h === "assessor");
        const grIdx = row.findIndex(h => h === "grupo");
        if (assIdx !== -1 && grIdx !== -1) {
          headerRowIdx = r;
          assessorColIdx = assIdx;
          grupoColIdx = grIdx;

          // Mapear as colunas dos dias de 1 a 31
          for (let d = 1; d <= 31; d++) {
            const dayStr = String(d);
            const colIdx = rows[r].findIndex(h => h.trim() === dayStr);
            if (colIdx !== -1) {
              dayColsMap[d] = colIdx;
            }
          }
          break;
        }
      }

      if (headerRowIdx === -1 || assessorColIdx === -1) {
        console.error("[parseSheetData] Não foi possível encontrar a linha de cabeçalho da aba Dados-GR.");
        return;
      }

      // Processar linhas de dados abaixo do cabeçalho
      let currentGrupo = "";

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (assessorColIdx >= row.length) continue;

        const assessorName = row[assessorColIdx] || "";
        const normName = normalizeText(assessorName);
        if (!assessorName || normName === "assessor" || normName === "total" || normName === "nº" || /^\d+$/.test(assessorName)) {
          continue;
        }

        const rawGrupo = grupoColIdx !== -1 && grupoColIdx < row.length ? row[grupoColIdx].trim() : "";
        if (rawGrupo) {
          currentGrupo = rawGrupo;
        }

        let assessorId = findEstagiarioIdLocal(assessorName);
        if (!assessorId) {
          const generatedId = assessorName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "");
          if (!generatedId || generatedId.length < 2) continue;

          if (!estagiariosCreatedTemp.includes(assessorName)) {
            estagiariosCreatedTemp.push(assessorName);
          }
          assessorId = generatedId;

          let parsedSector: "público" | "privado 1" | "privado 2" | "privado 3" | "crime" = "público";
          const normGrupo = normalizeText(currentGrupo);
          if (normGrupo === "dp") {
            parsedSector = "público";
          } else if (normGrupo === "dp 1" || normGrupo === "dp1" || normGrupo === "dp i" || normGrupo === "dpi" || normGrupo === "dp l" || normGrupo === "dpl") {
            parsedSector = "privado 1";
          } else if (normGrupo === "dp 2" || normGrupo === "dp2" || normGrupo === "dp ii" || normGrupo === "dpii" || normGrupo === "dp ll" || normGrupo === "dpll") {
            parsedSector = "privado 2";
          } else if (normGrupo === "dp 3" || normGrupo === "dp3" || normGrupo === "dp iii" || normGrupo === "dpiii" || normGrupo === "dp lll" || normGrupo === "dplll") {
            parsedSector = "privado 3";
          } else if (normGrupo === "dc") {
            parsedSector = "crime";
          }

          if (!estagiariosFromSheet.some(x => x.id === assessorId)) {
            estagiariosFromSheet.push({
              id: assessorId,
              name: assessorName,
              sector: parsedSector,
              dailyGoal: 25,
              matricula: "",
            });
            combinedCurrentAndSheetEstagiarios.push({
              id: assessorId,
              name: assessorName,
              sector: parsedSector,
              dailyGoal: 25,
              matricula: "",
            });
          }
        } else {
          let parsedSector: "público" | "privado 1" | "privado 2" | "privado 3" | "crime" = "público";
          const normGrupo = normalizeText(currentGrupo);
          if (normGrupo === "dp") {
            parsedSector = "público";
          } else if (normGrupo === "dp 1" || normGrupo === "dp1" || normGrupo === "dp i" || normGrupo === "dpi" || normGrupo === "dp l" || normGrupo === "dpl") {
            parsedSector = "privado 1";
          } else if (normGrupo === "dp 2" || normGrupo === "dp2" || normGrupo === "dp ii" || normGrupo === "dpii" || normGrupo === "dp ll" || normGrupo === "dpll") {
            parsedSector = "privado 2";
          } else if (normGrupo === "dp 3" || normGrupo === "dp3" || normGrupo === "dp iii" || normGrupo === "dpiii" || normGrupo === "dp lll" || normGrupo === "dplll") {
            parsedSector = "privado 3";
          } else if (normGrupo === "dc") {
            parsedSector = "crime";
          }

          const existingIdx = estagiariosFromSheet.findIndex(x => x.id === assessorId);
          if (existingIdx !== -1) {
            estagiariosFromSheet[existingIdx].sector = parsedSector;
          } else {
            const currentObj = currentEstagiarios.find(x => x.id === assessorId);
            if (currentObj && currentObj.sector !== parsedSector) {
              estagiariosFromSheet.push({
                ...currentObj,
                sector: parsedSector,
              });
            }
          }
        }

        if (SKIP_IDS.has(assessorId)) continue;

        for (let d = 1; d <= 31; d++) {
          const colIdx = dayColsMap[d];
          if (colIdx === undefined || colIdx >= row.length) continue;

          const rawVal = row[colIdx];
          let parsedVal = 0;
          if (rawVal) {
            const cleanedVal = rawVal.replace(/\s/g, "").replace(",", ".");
            const num = Math.round(parseFloat(cleanedVal));
            if (!isNaN(num) && num >= 0) {
              parsedVal = num;
            }
          }

          const monthPrefix = selectedMonth || getCurrentMonth();
          const dayStr = String(d).padStart(2, "0");
          const isoDate = `${monthPrefix}-${dayStr}`;

          if (isoDate === "2026-06-22") continue;

          parsedEntries.push({
            estagiarioId: assessorId,
            date: isoDate,
            count: parsedVal,
          });

          if (parsedVal > 0) {
            for (let i = 1; i <= parsedVal; i++) {
              parsedDetailedProcesses.push({
                estagiarioId: assessorId,
                date: isoDate,
                numeroProcesso: `Proc-${assessorId.substring(0, 3).toUpperCase()}-${isoDate.replace(/-/g, "")}-${i}`,
                origem: "CV",
              });
            }
          }
        }
      }
    });

    // ELIMINATE DUPLICATES AND REDUNDANCIES:
    const consolidatedMap: { [key: string]: Omit<ProductivityEntry, "id"> } =
      {};
    parsedEntries.forEach((entry) => {
      const key = `${entry.estagiarioId}_${entry.date}`;
      if (consolidatedMap[key]) {
        consolidatedMap[key].count += entry.count;
      } else {
        consolidatedMap[key] = { ...entry };
      }
    });

    const consolidatedEntries = Object.values(consolidatedMap);

    // Ensure estagiariosCreatedTemp has detailed representations in estagiariosFromSheet
    estagiariosCreatedTemp.forEach((name) => {
      const code = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      if (
        code &&
        !SKIP_IDS.has(code) &&
        !estagiariosFromSheet.some((e) => e.id === code) &&
        !currentEstagiarios.some((e) => e.id === code)
      ) {
        estagiariosFromSheet.push({
          id: code,
          name: name,
          sector: "público",
          dailyGoal: 25,
          matricula: "",
        });
      }
    });

    // Extract names for backward compatibility list display
    const uniqueEstagiariosCreated = Array.from(
      new Set(estagiariosFromSheet.map((e) => e.name)),
    );

    let msg = "";
    if (consolidatedEntries.length === 0 && diagDetalhado) {
      msg = `Sincronizados 0 casos. Diag: typesRowIdx=${diagTypesRowIdx}, dateColIdx=${diagDateColIdx} (${diagMaxDateCount} datas), totalLinhas=${diagTotalRows}, usuarios=[${diagMappedUsers.join(", ")}], primeiraLinhaDump=[${diagFirstRowDump}], primeiraDataRaw="${diagFirstDateRaw}", primeiraDataIso="${diagFirstDateIso}"`;
    } else if (estagiariosSheetContent && controleSheets.length > 0) {
      const namesList = controleSheets.map((s) => `"${s.name}"`).join(", ");
      msg = `Sincronização concluída! Foram sincronizados ${consolidatedEntries.length} casos de produtividade ao todo a partir de ${controleSheets.length} aba(s) (${namesList}) e localizados ${estagiariosFromSheet.length} perfis de estagiários na aba "${estagiariosSheetName}".`;
    } else if (controleSheets.length > 0) {
      const namesList = controleSheets.map((s) => `"${s.name}"`).join(", ");
      msg = `Sincronização concluída! Foram sincronizados ${consolidatedEntries.length} casos de produtividade ao todo a partir de ${controleSheets.length} aba(s) (${namesList}).`;
    } else {
      msg = `Sincronização concluída! Importados ${estagiariosFromSheet.length} perfis de estagiários.`;
    }

    return {
      success: true,
      entries: consolidatedEntries,
      estagiariosCreated: uniqueEstagiariosCreated,
      estagiariosDetailedToCreate: estagiariosFromSheet,
      detailedProcesses: parsedDetailedProcesses,
      message: msg,
      debugRows: debugRows,
    };
  };

  // Trigger Sheet Sync
  const triggerSheetsSync = async (
    urlStr: string,
    activeEstagiarios: Estagiario[],
    showFeedback: boolean = true,
  ) => {
    if (googleToken === "mock_token") {
      if (showFeedback) {
        showToast("Sincronização de planilha desabilitada no modo de teste local.", "info");
      }
      return;
    }
    if (!urlStr) {
      if (showFeedback)
        alert("Por favor, insira o link da Planilha do Google.");
      return;
    }

    const isDocUrl = urlStr.includes("/d/");
    if (!isDocUrl) {
      if (showFeedback)
        alert(
          "URL do Google Planilhas inválida. Certifique-se de copiar o link do seu navegador.",
        );
      return;
    }

    let timerId: any = null;
    setSyncingSheets(true);
    setSyncDuration(0);
    const startTime = Date.now();
    timerId = setInterval(() => {
      setSyncDuration((Date.now() - startTime) / 1000);
    }, 100);

    if (showFeedback) {
      setSheetsMessage("Iniciando conexão de sincronização...");
    }
    setSheetSyncError("");

    try {
      const activeToken = (await getAccessToken()) || googleToken;
      if (!activeToken) {
        throw new Error("Token de acesso não disponível. Faça login novamente.");
      }

      const resData = await fetchSheetDataDirectly(urlStr, activeToken);
      const parseResult = parseSheetData(
        resData.sheets || resData.csvText,
        activeEstagiarios,
        selectedSheetName,
      );

      if (showFeedback) {
        try {
          await setDoc(
            doc(db, "settings", "sync_diagnostics_raw"),
            {
              timestamp: new Date().toISOString(),
              showFeedback,
              sheetsNames: Object.keys(resData.sheets || {}),
              message: parseResult.message,
              entriesCount: parseResult.entries?.length || 0,
              entries: (parseResult.entries || []).map(e => ({ estagiarioId: e.estagiarioId, date: e.date, count: e.count })),
              detailedProcessesCount: parseResult.detailedProcesses?.length || 0,
              detailedProcesses: (parseResult.detailedProcesses || []).slice(0, 10),
              debugRows: parseResult.debugRows || [],
            }
          );
        } catch (diagErr) {
          console.error("Failed raw diagnostics write:", diagErr);
        }
      }

      if (!parseResult.success) {
        setHasSpreadsheetAccess(false);
        if (showFeedback) alert(parseResult.message);
        setSheetSyncError(parseResult.message);
        return;
      }

      setHasSpreadsheetAccess(true);
      setPreviewEntries(parseResult.entries);
      setPreviewEstagiariosToCreate(parseResult.estagiariosCreated);
      setPreviewEstagiariosDetailed(
        parseResult.estagiariosDetailedToCreate || [],
      );
      setSheetsMessage(parseResult.message);
      setSheetSyncError("");

      // Salva no Firestore — sincronização completa para ambas manual e automática
      let finalEntriesToSave = parseResult.entries;
      let finalDetailedProcesses = parseResult.detailedProcesses || [];

      await saveSyncedDataToFirestore(
        finalEntriesToSave,
        parseResult.estagiariosCreated,
        urlStr,
        !showFeedback,
        parseResult.estagiariosDetailedToCreate || [],
        finalDetailedProcesses,
      );

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      setLastSyncDuration(duration);

      if (showFeedback) {
        setIsSheetsModalOpen(true);
      }
    } catch (err: any) {
      console.error(err);
      const isQuotaError = err.status === 429 || (err.message && err.message.toLowerCase().includes("quota"));
      if (err.status === 401 || err.status === 403) {
        setHasSpreadsheetAccess(false);
        // Se for erro de sessão expirada / token inválido (401), dispara o robô de reconexão automática
        if (err.status === 401) {
          console.warn("Detectado token do Google expirado (401). Disparando robô de reconexão...");
          triggerLoginAutomation();
        }
      } else if (!isQuotaError && !hasSpreadsheetAccess && hasSpreadsheetAccess !== null) {
        // Leave it false if it was already false, but if it's 429, don't force it to false
        setHasSpreadsheetAccess(false);
      } else if (!isQuotaError && hasSpreadsheetAccess === null) {
        setHasSpreadsheetAccess(false);
      }
      
      let errMsg = err.message || "Verifique as configurações de compartilhamento da planilha.";
      const isScopeError = errMsg.toLowerCase().includes("scope") || errMsg.toLowerCase().includes("insufficient");
      if (isScopeError) {
        errMsg = "Erro de Permissão (Escopo Insuficiente): A conta conectada não concedeu permissão para ler planilhas do Google. Por favor, faça logout do Google no banner ou menu lateral e reconecte, garantindo que autorizou o acesso às planilhas. Se o erro persistir, certifique-se de que o escopo de leitura do Sheets ('https://www.googleapis.com/auth/spreadsheets.readonly') está habilitado no provedor Google dentro do painel do Supabase.";
      }
      setSheetSyncError(errMsg);
      if (showFeedback) {
        alert(`Falha na sincronização em tempo real: ${errMsg}`);
      }
    } finally {
      if (timerId) clearInterval(timerId);
      setSyncingSheets(false);
    }
  };

  // Função para disparar a automação de login (Puppeteer) no backend
  const triggerLoginAutomation = async () => {
    const now = Date.now();
    // Limita o disparo do robô a 1 vez a cada 5 minutos para evitar loops
    if (now - lastAutomationTriggerTime < 300000) {
      console.log("[Automation] O robô de login já foi chamado recentemente. Ignorando para evitar loops.");
      return;
    }
    lastAutomationTriggerTime = now;
    showToast("Sincronização pausada. Solicitando reconexão automática ao servidor...", "info");

    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const backendUrl = isLocalhost 
        ? "/api/trigger-login-automation" 
        : "http://localhost:3005/api/trigger-login-automation";
      
      const logsUrl = isLocalhost
        ? "/api/automation-status"
        : "http://localhost:3005/api/automation-status";

      const res = await fetch(backendUrl, { method: "POST" });
      if (!res.ok) {
        throw new Error(`Erro HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        console.log("[Automation] Robô de login iniciado no servidor com sucesso.");
        
        // Polling de logs do robô em tempo real
        let printedLogsCount = 0;
        console.log("%c[Automation] Iniciando leitura dos logs em tempo real...", "color: #4f46e5; font-weight: bold;");
        
        const logInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(logsUrl);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              
              if (statusData.logs && statusData.logs.length > printedLogsCount) {
                const newLogs = statusData.logs.slice(printedLogsCount);
                newLogs.forEach((log: string) => {
                  console.log(`%c[Automation Robot]%c ${log}`, "color: #4f46e5; font-weight: bold;", "color: inherit;");
                });
                printedLogsCount = statusData.logs.length;
              }
              
              if (!statusData.running) {
                clearInterval(logInterval);
                console.log("%c[Automation] Execução finalizada. Parando leitura dos logs.", "color: #4f46e5; font-weight: bold;");
              }
            }
          } catch (logErr) {
            console.error("[Automation] Erro ao buscar logs do robô:", logErr);
            clearInterval(logInterval);
          }
        }, 1500);

      } else {
        console.warn("[Automation] Backend retornou erro ao iniciar robô:", data.error);
      }
    } catch (e: any) {
      console.error("[Automation] Falha ao solicitar início da automação no servidor:", e);
      showToast(
        "Não foi possível conectar ao servidor de automação local (http://localhost:3005). Certifique-se de que o backend está rodando localmente (npm run dev).",
        "error"
      );
    }
  };

  // Convert pasted text (Ctrl+V) instantly
  const handleImportPastedData = async () => {
    if (!pasteDataText.trim()) {
      showToast(
        "Por favor, copie dados da sua planilha Excel e cole na caixa de texto.",
        "error",
      );
      return;
    }

    const parseResult = parseSheetData(pasteDataText, estagiarios, selectedSheetName);
    if (!parseResult.success) {
      showToast(parseResult.message, "error");
      return;
    }

    setPreviewEntries(parseResult.entries);
    setPreviewEstagiariosToCreate(parseResult.estagiariosCreated);
    setPreviewEstagiariosDetailed(
      parseResult.estagiariosDetailedToCreate || [],
    );
    setSheetsMessage(
      parseResult.message + " (Copiado da área de transferência)",
    );

    try {
      // Salva automaticamente no Firestore também para colagem direta do Excel
      await saveSyncedDataToFirestore(
        parseResult.entries,
        parseResult.estagiariosCreated,
        spreadsheetUrl,
        false,
        parseResult.estagiariosDetailedToCreate || [],
        parseResult.detailedProcesses || [],
      );
      showToast(
        "Dados salvos e sincronizados no banco com sucesso!",
        "success",
      );
      setPasteDataText(""); // clear input after success
      setIsSheetsModalOpen(false); // close modal
    } catch (e: any) {
      showToast("Erro ao salvar dados colados: " + e.message, "error");
    }
  };

  // Salva apenas as configurações de vínculo com a planilha no Firebase e já realiza a sincronização imediata salvando os dados
  const handleSaveSheetSettings = async () => {
    if (!spreadsheetUrl.trim()) {
      alert("Por favor, insira o link da Planilha do Google antes de salvar.");
      return;
    }

    const isDocUrl = spreadsheetUrl.includes("/d/");
    if (!isDocUrl) {
      alert(
        "URL do Google Planilhas inválida. Certifique-se de copiar o link completo do seu navegador.",
      );
      return;
    }

    setIsSaving(true);
    setSyncingSheets(true);
    setSyncDuration(0);
    const startTime = Date.now();
    const timerId = setInterval(() => {
      setSyncDuration((Date.now() - startTime) / 1000);
    }, 100);
    setSheetsMessage("Configurando vínculo e importando dados da planilha...");
    try {
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, "settings", "googleSheet"),
        {
          url: spreadsheetUrl.trim(),
          autoSync: autoSyncEnabled,
          selectedSheetName: selectedSheetName.trim(),
          lastSync: nowIso,
        },
        { merge: true },
      );
      setLastSyncTime(nowIso);

      // Executa sincronização imediata
      const activeToken = (await getAccessToken()) || googleToken;
      if (!activeToken) {
        throw new Error("Token de acesso não disponível. Faça login novamente.");
      }

      const resData = await fetchSheetDataDirectly(spreadsheetUrl.trim(), activeToken);
      const parseResult = parseSheetData(
        resData.sheets || resData.csvText,
        estagiarios,
        selectedSheetName,
      );

      if (!parseResult.success) {
        throw new Error(parseResult.message);
      }

      setPreviewEntries(parseResult.entries);
      setPreviewEstagiariosToCreate(parseResult.estagiariosCreated);
      setPreviewEstagiariosDetailed(
        parseResult.estagiariosDetailedToCreate || [],
      );
      setSheetsMessage(parseResult.message);
      setSheetSyncError("");

      // Salva os dados carregados no Firestore instantaneamente
      await saveSyncedDataToFirestore(
        parseResult.entries,
        parseResult.estagiariosCreated,
        spreadsheetUrl.trim(),
        true, // isStartupSilent = true
        parseResult.estagiariosDetailedToCreate || [],
        parseResult.detailedProcesses || [],
      );

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      setLastSyncDuration(duration);

      alert(
        `A planilha foi vinculada e sincronizada com sucesso! Foram salvos ${parseResult.entries.length} lançamentos de produtividade no banco de dados. ` +
          (autoSyncEnabled
            ? "A Sincronização em Tempo Real está ATIVA para carregar dados automaticamente ao abrir o site."
            : ""),
      );

      // Limpa os dados de preview
      setPreviewEntries([]);
      setPreviewEstagiariosToCreate([]);
      setPreviewEstagiariosDetailed([]);
    } catch (err: any) {
      console.error(err);
      alert(
        "Erro ao gravar vínculo e sincronizar dados: " + (err.message || err),
      );
      setSheetSyncError(err.message || "");
    } finally {
      if (timerId) clearInterval(timerId);
      setIsSaving(false);
      setSyncingSheets(false);
    }
  };

  // Desvincula a planilha atual do sistema
  const handleUnlinkSheet = async () => {
    if (
      !window.confirm(
        "Tem certeza que deseja remover o vínculo com esta planilha? O link será limpo do sistema, mas os dados de processos já salvos serão preservados.",
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "googleSheet"),
        {
          url: "",
          autoSync: false,
          lastSync: null,
        },
        { merge: true },
      );

      setSpreadsheetUrl("");
      setAutoSyncEnabled(false);
      setLastSyncTime("");
      alert("Vínculo removido com sucesso!");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao desvincular planilha: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  const saveSyncedDataToFirestore = async (
    entriesToSave: Omit<ProductivityEntry, "id">[],
    estagiariosToCreate: string[],
    sheetUrl: string = spreadsheetUrl,
    isStartupSilent: boolean = false,
    estagiariosDetailedToCreate: Estagiario[] = previewEstagiariosDetailed,
    detailedProcesses: Array<{ estagiarioId: string; date: string; numeroProcesso: string; origem: string }> = [],
  ) => {
    setIsSaving(true);
    try {
        // Gravar timestamps dos processos detalhados nas abas individuais se existirem
        if (detailedProcesses && detailedProcesses.length > 0) {
          const processesBySettingsKey: Record<string, typeof detailedProcesses> = {};
          detailedProcesses.forEach((proc) => {
            const monthKey = proc.date.substring(0, 7); // "2026-06"
            const key = `proc_time_${proc.estagiarioId}_${monthKey}`;
            if (!processesBySettingsKey[key]) {
              processesBySettingsKey[key] = [];
            }
            processesBySettingsKey[key].push(proc);
          });

          for (const [key, procs] of Object.entries(processesBySettingsKey)) {
            try {
              // Sincronização manual (!isStartupSilent) substitui os dados existentes
              // Sincronização automática (isStartupSilent) só adiciona novos
              if (!isStartupSilent) {
                // Substitui completamente — garante que os dados do sheet sejam refletidos fielmente
                const freshData: Record<string, { origem: string; date: string; timestamp: string }> = {};
                procs.forEach((p) => {
                  if (!freshData[p.numeroProcesso]) {
                    freshData[p.numeroProcesso] = {
                      origem: p.origem,
                      date: p.date,
                      timestamp: new Date().toISOString(),
                    };
                  }
                });
                await setDoc(doc(db, "settings", key), freshData);
              } else {
                // Apenas adiciona entradas novas (não sobrescreve dados históricos)
                const snap = await getDoc(doc(db, "settings", key));
                const existingData: Record<string, { origem: string; date: string; timestamp: string }> = snap.exists() ? snap.data() || {} : {};
                let hasChanges = false;

                procs.forEach((p) => {
                  if (!existingData[p.numeroProcesso]) {
                    existingData[p.numeroProcesso] = {
                      origem: p.origem,
                      date: p.date,
                      timestamp: new Date().toISOString(),
                    };
                    hasChanges = true;
                  }
                });

                if (hasChanges || !snap.exists()) {
                  await setDoc(doc(db, "settings", key), existingData);
                }
              }
            } catch (procErr) {
              console.error(`Erro ao salvar processos para chave ${key}:`, procErr);
            }
          }

          // Atualiza o estado local allDetailedProcesses para refletir os dados novos imediatamente sem refresh
          setAllDetailedProcesses((prev) => {
            const next = { ...prev };
            Object.entries(processesBySettingsKey).forEach(([key, procs]) => {
              const parts = key.split("_");
              if (parts.length >= 3) {
                const estId = parts.slice(2, parts.length - 1).join("_");
                if (!next[estId]) next[estId] = {};

                if (!isStartupSilent) {
                  const newMap: Record<string, { origem: string; date: string }> = {};
                  procs.forEach((p) => {
                    newMap[p.numeroProcesso] = { origem: p.origem, date: p.date };
                  });
                  next[estId] = newMap;
                } else {
                  const existingMap = { ...next[estId] };
                  procs.forEach((p) => {
                    if (!existingMap[p.numeroProcesso]) {
                      existingMap[p.numeroProcesso] = { origem: p.origem, date: p.date };
                    }
                  });
                  next[estId] = existingMap;
                }
              }
            });
            return next;
          });
        }
      // 1. Upsert estagiários (usar lista detalhada se disponível, fallback para lista de nomes)
      let estagiariosToUpsert: Estagiario[] = [];

      if (estagiariosDetailedToCreate && estagiariosDetailedToCreate.length > 0) {
        estagiariosToUpsert = estagiariosDetailedToCreate.filter((e) => e && e.id);
      } else {
        for (const name of estagiariosToCreate) {
          const computedId = name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "");
          if (!computedId) continue;
          if (!estagiarios.some((a) => a.id === computedId)) {
            estagiariosToUpsert.push({
              id: computedId,
              name,
              sector: "público",
              dailyGoal: 25,
              matricula: "",
            });
          }
        }
      }

      // Otimização: Filtrar apenas os estagiários que sofreram alguma modificação cadastral ou novos cadastros
      const finalEstagiariosToUpsert = estagiariosToUpsert.filter((newEstag) => {
        const existing = estagiariosRef.current.find((e) => e.id === newEstag.id);
        if (!existing) return true; // Novo cadastro
        return (
          existing.name !== newEstag.name ||
          existing.sector !== newEstag.sector ||
          existing.dailyGoal !== newEstag.dailyGoal ||
          existing.matricula !== newEstag.matricula
        );
      });

      if (finalEstagiariosToUpsert.length > 0) {
        await batchUpsertEstagiarios(finalEstagiariosToUpsert);
        // Atualiza estado local
        setEstagiarios((prev) => {
          const next = [...prev];
          finalEstagiariosToUpsert.forEach((e) => {
            const idx = next.findIndex((x) => x.id === e.id);
            if (idx !== -1) {
              next[idx] = { ...next[idx], ...e };
            } else {
              next.push(e);
            }
          });
          return next.filter((e) => e && e.id).sort((a, b) => a.name.localeCompare(b.name));
        });
      }

      // 2. Upsert entradas de produtividade em massa
      const validEntries = entriesToSave.filter((e) => e && e.estagiarioId && e.date);
      
      // Otimização de gravação: Filtrar e reter somente as entradas cujas quantidades mudaram ou novas entradas
      const entriesToUpsert: Omit<ProductivityEntry, "id">[] = [];
      validEntries.forEach((entry) => {
        const existing = entriesRef.current.find(
          (e) => e.estagiarioId === entry.estagiarioId && e.date === entry.date
        );
        const existingBStr = JSON.stringify(existing?.typeBreakdown || {});
        const entryBStr = JSON.stringify(entry.typeBreakdown || {});
        if (!existing || existing.count !== entry.count || existingBStr !== entryBStr) {
          entriesToUpsert.push(entry);
        }
      });

      if (entriesToUpsert.length > 0) {
        await batchUpsertEntries(entriesToUpsert);

        // Atualiza o estado local 'entries' diretamente com os novos valores que foram salvos
        // Isso previne a race condition de sumir os dados da tela pois não faz getDocs total assíncrono concorrente com o realtime
        setEntries((prev) => {
          const next = [...prev];
          entriesToUpsert.forEach((newEntry) => {
            const idx = next.findIndex(
              (e) => e.estagiarioId === newEntry.estagiarioId && e.date === newEntry.date
            );
            if (idx !== -1) {
              // Mantém o ID original do banco para consistência
              next[idx] = { ...next[idx], count: newEntry.count, typeBreakdown: newEntry.typeBreakdown };
            } else {
              // Adiciona temporariamente sem ID (o Realtime Socket atualizará o ID definitivo do banco logo em seguida)
              next.push({
                id: `temp_${newEntry.estagiarioId}_${newEntry.date}`,
                ...newEntry,
              });
            }
          });
          return next;
        });
      }

      // 4. Salvar configurações da planilha
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, "settings", "googleSheet"),
        {
          url: sheetUrl,
          autoSync: autoSyncEnabled,
          selectedSheetName: selectedSheetName.trim(),
          lastSync: nowIso,
        },
        { merge: true },
      );
      setLastSyncTime(nowIso);

      try {
        await setDoc(
          doc(db, "settings", "sync_diagnostics"),
          {
            timestamp: nowIso,
            entriesToSaveCount: entriesToSave.length,
            entriesToSave: entriesToSave.map(e => ({ estagiarioId: e.estagiarioId, date: e.date, count: e.count })),
            estagiariosToCreate,
            detailedProcessesCount: detailedProcesses.length,
          }
        );
      } catch (diagErr) {
        console.error("Failed to write sync diagnostics:", diagErr);
      }

      // O mês selecionado não é mais alterado automaticamente no final da sincronização para respeitar a navegação do usuário e manter o mês atual selecionado.

      if (!isStartupSilent) {
        alert(
          `Carregamento concluído! Sincronizados ${entriesToSave.length} lançamentos de produtividade. ${estagiariosToUpsert.length > 0 ? `${estagiariosToUpsert.length} estagiários sincronizados` : ""}.`,
        );
        setIsSheetsModalOpen(false);
        setPasteDataText("");
        setPreviewEntries([]);
        setPreviewEstagiariosToCreate([]);
        setPreviewEstagiariosDetailed([]);
      }
    } catch (err) {
      console.error("Error writing synced data", err);
      if (!isStartupSilent)
        alert("Erro ao gravar novos dados sincronizados no Supabase.");
    } finally {
      setIsSaving(false);
    }
  };


  useEffect(() => {
    fetchData();

    // Supabase Realtime — atualiza o estado local automaticamente
    const unsubEstag = subscribeToEstagiarios(
      (updated) => {
        setEstagiarios((prev) => {
          const idx = prev.findIndex((e) => e.id === updated.id);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = updated;
            return next.sort((a, b) => a.name.localeCompare(b.name));
          }
          return [...prev, updated].sort((a, b) => a.name.localeCompare(b.name));
        });
      },
      (deletedId) => {
        setEstagiarios((prev) => prev.filter((e) => e.id !== deletedId));
      }
    );

    const unsubSettings = subscribeToSettings((key, value) => {
      if (key === "googleSheet") {
        setSpreadsheetUrl(value?.url || DEFAULT_SHEET_URL);
        setAutoSyncEnabled(value?.autoSync !== undefined ? value.autoSync : true);
        // Sempre usa "Dados-GR" para a aba, ignorando valor antigo do banco
        setSelectedSheetName("Dados-GR");
        setLastSyncTime(value?.lastSync || "");
      }
    });

    return () => {
      unsubEstag();
      unsubSettings();
    };
  }, []);

  // Carregar processos detalhados com horario
  useEffect(() => {
    if (!selectedEstagiarioDetail) {
      setDetailedProcesses({});
      return;
    }

    const fetchDetailedProcesses = async () => {
      setLoadingProcesses(true);
      try {
        const key = `proc_time_${selectedEstagiarioDetail}_${selectedMonth}`;
        const snap = await getDoc(doc(db, "settings", key));
        if (snap.exists()) {
          setDetailedProcesses(snap.data() || {});
        } else {
          setDetailedProcesses({});
        }
      } catch (err) {
        console.error("Erro ao buscar processos detalhados:", err);
      } finally {
        setLoadingProcesses(false);
      }
    };

    fetchDetailedProcesses();
    setDetailTab("month"); // Sempre abre na aba mensal por padrao
  }, [selectedEstagiarioDetail, selectedMonth]);

  // Carregar processos detalhados de todos os estagiários para o mês selecionado (usado no gráfico de rosça)
  useEffect(() => {
    const fetchAllDetailedProcesses = async () => {
      if (estagiarios.length === 0) return;
      const result: Record<string, Record<string, { origem: string; date: string }>> = {};
      const promises = estagiarios.map(async (est) => {
        try {
          const key = `proc_time_${est.id}_${selectedMonth}`;
          const snap = await getDoc(doc(db, "settings", key));
          if (snap.exists()) {
            result[est.id] = snap.data() || {};
          }
        } catch (err) {
          console.error(`Erro ao buscar processos detalhados de ${est.id}:`, err);
        }
      });
      await Promise.all(promises);
      setAllDetailedProcesses(result);
    };
    fetchAllDetailedProcesses();
  }, [estagiarios, selectedMonth]);

  // Sincronização automática dinâmica ao iniciar o aplicativo e contínua:
  useEffect(() => {
    if (googleToken === "mock_token") return;
    // Sincronização inicial (agora ignora autoSyncEnabled para sempre verificar acesso no boot)
    if (
      spreadsheetUrl &&
      !loading &&
      !isAuthLoading &&
      !hasAutoSyncedOnStartup
    ) {
      setHasAutoSyncedOnStartup(true);
      triggerSheetsSync(spreadsheetUrl, estagiariosRef.current, false);
    }
  }, [
    spreadsheetUrl,
    loading,
    isAuthLoading,
    hasAutoSyncedOnStartup,
    googleToken,
  ]);

  // Polling para "tempo real" a cada 60 segundos (diminuído consumo de requisições)
  useEffect(() => {
    if (googleToken === "mock_token") return;
    let interval: ReturnType<typeof setInterval>;

    if (
      spreadsheetUrl &&
      autoSyncEnabled &&
      estagiarios.length > 0 &&
      hasAutoSyncedOnStartup &&
      !syncingSheets
    ) {
      interval = setInterval(() => {
        triggerSheetsSync(spreadsheetUrl, estagiariosRef.current, false);
      }, 60000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    spreadsheetUrl,
    autoSyncEnabled,
    estagiarios,
    hasAutoSyncedOnStartup,
    syncingSheets,
    googleToken,
  ]);

  // Real-time notifications for productivity updates
  useEffect(() => {
    if (!estagiarios || estagiarios.length === 0 || normalizedEntries.length === 0)
      return;

    const todayStr = getCurrentDate();
    const currentTodayCounts = estagiarios.reduce(
      (acc, estagiario) => {
        const todayEntry = normalizedEntries.find(
          (e) => e.estagiarioId === estagiario.id && e.date === todayStr,
        );
        acc[estagiario.id] = todayEntry ? todayEntry.count : 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Inicialização silenciosa no primeiro boot para evitar notificações retroativas
    if (Object.keys(previousTodayCounts.current).length === 0) {
      previousTodayCounts.current = currentTodayCounts;
      maxNotifiedCounts.current = { ...currentTodayCounts };
      return;
    }

    for (const est of estagiarios) {
      const prev = previousTodayCounts.current[est.id] || 0;
      const curr = currentTodayCounts[est.id] || 0;
      const maxNotified = maxNotifiedCounts.current[est.id] || 0;
      const diff = curr - prev;

      // Só notifica se a contagem subiu e se o novo valor de hoje for maior do que qualquer valor já notificado hoje
      // Isso previne notificações repetitivas/fantasmas decorrentes de flutuações temporárias ou recargas do socket
      if (diff > 0 && curr > maxNotified) {
        maxNotifiedCounts.current[est.id] = curr; // Atualiza a marca histórica de notificação
        
        const newNotif = {
          id: Date.now() + "_" + est.id + "_" + Math.random(),
          estagiarioName: est.name,
          diff,
          count: curr,
        };
        setNotifications((prevArr) => [...prevArr, newNotif]);

        setTimeout(() => {
          setNotifications((prevArr) =>
            prevArr.filter((n) => n.id !== newNotif.id),
          );
        }, 6000);
      }
    }

    previousTodayCounts.current = currentTodayCounts;
  }, [normalizedEntries, estagiarios]);

  // Current formatted time & date
  const formattedTime = useMemo(() => {
    return currentTime.toLocaleTimeString("pt-BR", { hour12: false });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, [currentTime]);

  // Handle entry saving (create or update)
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEstagiarioId || !formDate || formCount < 0) return;

    setIsSaving(true);
    try {
      const entryId = formEditingId || `${formEstagiarioId}_${formDate}`;
      const payload: ProductivityEntry = {
        id: entryId,
        estagiarioId: formEstagiarioId,
        date: formDate,
        count: Number(formCount),
      };

      await setDoc(doc(db, "productivityEntries", entryId), payload);

      // Update local state smoothly
      setEntries((prev) => {
        const filtered = prev.filter((item) => item.id !== entryId);
        return [...filtered, payload];
      });

      // Reset form & close modal
      setFormEditingId(null);
      setFormCount(0);
      setIsLaunchModalOpen(false);
    } catch (err) {
      console.error("Error saving entry:", err);
      alert("Erro ao salvar o registro de produtividade.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle deleting entry
  const handleDeleteEntry = async (entryId: string) => {
    if (
      !window.confirm(
        "Deseja realmente excluir este registro de produtividade sem retorno?",
      )
    )
      return;

    setIsSaving(true);
    try {
      await deleteDoc(doc(db, "productivityEntries", entryId));
      setEntries((prev) => prev.filter((item) => item.id !== entryId));
    } catch (err) {
      console.error("Error deleting entry:", err);
      alert("Erro ao excluir o registro.");
    } finally {
      setIsSaving(false);
    }
  };

  // Add new Estagiario
  const handleAddEstagiario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEstagiarioName.trim()) return;

    const computedId = (
      newEstagiarioId.trim().toLowerCase().replace(/\s+/g, "_") ||
      newEstagiarioName
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
    ).replace(/[^a-z0-9_]/g, "");

    if (!computedId) {
      alert(
        "Não foi possível gerar um identificador ID válido a partir das informações inseridas.",
      );
      return;
    }

    if (estagiarios.some((a) => a.id === computedId)) {
      alert("Um assessor com este ID ou nome simplificado já existe!");
      return;
    }

    setIsSaving(true);
    try {
      const newEstagiarioObj: Estagiario = {
        id: computedId,
        name: newEstagiarioName.trim(),
        sector: newEstagiarioRole as any,
        dailyGoal: Number(newEstagiarioDailyGoal),
        matricula: newEstagiarioMatricula.trim(),
      };

      await setDoc(doc(db, "estagiarios", computedId), newEstagiarioObj);
      setEstagiarios((prev) =>
        [...prev, newEstagiarioObj].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );

      setNewEstagiarioName("");
      setNewEstagiarioId("");
      setNewEstagiarioRole("público");
      setNewEstagiarioDailyGoal(25);
      setNewEstagiarioMatricula("");
      setIsAddEstagiarioOpen(false);
    } catch (err) {
      console.error("Error adding estagiario:", err);
      alert("Erro ao criar assessor.");
    } finally {
      setIsSaving(false);
    }
  };

  // Update existing Estagiario cadastre (name, type, goal)
  const handleUpdateEstagiarioCadastre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEstagiarioDetail || !editEstagiarioName.trim()) return;

    setIsSaving(true);
    try {
      const updatedEstagiarioObj: Estagiario = {
        id: selectedEstagiarioDetail,
        name: editEstagiarioName.trim(),
        sector: editEstagiarioRole as any,
        dailyGoal: Number(editEstagiarioDailyGoal),
        matricula: editEstagiarioMatricula.trim(),
      };

      await setDoc(
        doc(db, "estagiarios", selectedEstagiarioDetail),
        updatedEstagiarioObj,
      );
      setEstagiarios((prev) =>
        prev.map((a) =>
          a.id === selectedEstagiarioDetail ? updatedEstagiarioObj : a,
        ),
      );
      setIsEditingCadastre(false);
    } catch (err) {
      console.error("Error updating estagiario:", err);
      alert("Erro ao atualizar o cadastro.");
    } finally {
      setIsSaving(false);
    }
  };

  // Excluir cadastro de Assessor
  const handleDeleteEstagiario = async (estagiarioId: string) => {
    const est = estagiarios.find((a) => a.id === estagiarioId);
    if (!est) return;

    if (
      !window.confirm(
        `Tem certeza que deseja excluir o cadastro do assessor "${est.name}"? Isso removerá o cadastro dele permanentemente no sistema.`
      )
    )
      return;

    setIsSaving(true);
    try {
      // 1. Deletar assessor do banco
      await deleteDoc(doc(db, "estagiarios", estagiarioId));

      // 2. Deletar todas as entries de produtividade deste assessor
      const estagiarioEntries = entries.filter((e) => e.estagiarioId === estagiarioId);
      for (const entry of estagiarioEntries) {
        await deleteDoc(doc(db, "productivityEntries", entry.id));
      }

      // 3. Atualizar o estado local
      setEstagiarios((prev) => prev.filter((a) => a.id !== estagiarioId));
      setEntries((prev) => prev.filter((item) => item.estagiarioId !== estagiarioId));

      // Fechar modal de detalhe
      setSelectedEstagiarioDetail(null);
      alert(`Cadastro do assessor "${est.name}" e seus respectivos históricos foram removidos.`);
    } catch (err) {
      console.error("Error deleting estagiario:", err);
      alert("Erro ao excluir o cadastro do assessor.");
    } finally {
      setIsSaving(false);
    }
  };



  // Função para redistribuir processos de um assessor para outro
  const handleRedistribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEstagiarioDetail || !redistributeFromId) {
      alert("Por favor, selecione o assessor de origem.");
      return;
    }
    if (selectedEstagiarioDetail === redistributeFromId) {
      alert("Não é possível redistribuir processos para a mesma pessoa.");
      return;
    }
    if (redistributeCount <= 0) {
      alert("A quantidade de processos a redistribuir deve ser maior que 0.");
      return;
    }

    setIsSaving(true);
    try {
      // 1. Obter registros de produtividade do assessor de origem
      const { data: fromEntries, error: err1 } = await supabase
        .from("productivity_entries")
        .select("*")
        .eq("assessor_id", redistributeFromId)
        .eq("date", redistributeDate);

      if (err1) throw err1;

      const fromEntry = fromEntries && fromEntries[0];
      const fromCount = fromEntry ? fromEntry.count : 0;

      if (fromCount < redistributeCount) {
        throw new Error(
          `O assessor de origem possui apenas ${fromCount} processos registrados em ${redistributeDate.split("-").reverse().join("/")}.`
        );
      }

      // 2. Obter registros de produtividade do assessor destino (atual)
      const { data: toEntries, error: err2 } = await supabase
        .from("productivity_entries")
        .select("*")
        .eq("assessor_id", selectedEstagiarioDetail)
        .eq("date", redistributeDate);

      if (err2) throw err2;

      const toEntry = toEntries && toEntries[0];
      const toCount = toEntry ? toEntry.count : 0;

      // 3. Atualizar assessor origem
      const updatedFromCount = fromCount - redistributeCount;
      if (updatedFromCount === 0 && fromEntry) {
        // Excluir registro se zerou
        const { error: delErr } = await supabase
          .from("productivity_entries")
          .delete()
          .eq("id", fromEntry.id);
        if (delErr) throw delErr;
      } else if (fromEntry) {
        const { error: updErr } = await supabase
          .from("productivity_entries")
          .update({ count: updatedFromCount })
          .eq("id", fromEntry.id);
        if (updErr) throw updErr;
      }

      // 4. Atualizar assessor destino
      const updatedToCount = toCount + redistributeCount;
      const payloadTo = {
        assessor_id: selectedEstagiarioDetail,
        date: redistributeDate,
        count: updatedToCount,
      };

      if (toEntry) {
        const { error: updErr } = await supabase
          .from("productivity_entries")
          .update({ count: updatedToCount })
          .eq("id", toEntry.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from("productivity_entries")
          .insert([payloadTo]);
        if (insErr) throw insErr;
      }

      // 5. Atualizar estado local
      setEntries((prev) => {
        // Remover ou atualizar o registro de origem
        let next = prev.filter((x) => !(x.estagiarioId === redistributeFromId && x.date === redistributeDate));
        if (updatedFromCount > 0) {
          next.push({
            id: fromEntry?.id || `${redistributeFromId}_${redistributeDate}`,
            estagiarioId: redistributeFromId,
            date: redistributeDate,
            count: updatedFromCount,
          });
        }
        
        // Atualizar ou inserir o registro de destino
        next = next.filter((x) => !(x.estagiarioId === selectedEstagiarioDetail && x.date === redistributeDate));
        next.push({
          id: toEntry?.id || `${selectedEstagiarioDetail}_${redistributeDate}`,
          estagiarioId: selectedEstagiarioDetail,
          date: redistributeDate,
          count: updatedToCount,
        });
        return next;
      });

      alert("Processos redistribuídos com sucesso!");
      setIsRedistributeOpen(false);
      setRedistributeCount(0);
      setRedistributeFromId("");
    } catch (err: any) {
      console.error("Erro ao redistribuir processos:", err);
      alert("Erro ao redistribuir processos: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  // List of unique months that have at least one productivity entry
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    entries.forEach((e) => {
      if (e.date && e.date.length >= 7) {
        monthsSet.add(e.date.substring(0, 7));
      }
    });
    // Ensure the current active selection is always in the options
    if (selectedMonth) {
      monthsSet.add(selectedMonth);
    } else {
      monthsSet.add("2026-06");
    }
    return Array.from(monthsSet).sort();
  }, [entries, selectedMonth]);

  // Helper date lists for Matrix
  const daysInMonthList = useMemo(() => {
    if (!selectedMonth) return [];
    const [year, month] = selectedMonth.split("-").map(Number);
    const date = new Date(year, month, 0);
    const daysCount = date.getDate();

    const days = [];
    for (let i = 1; i <= daysCount; i++) {
      const dayStr = String(i).padStart(2, "0");
      const monthStr = String(month).padStart(2, "0");
      days.push(`${year}-${monthStr}-${dayStr}`);
    }
    return days;
  }, [selectedMonth]);

  // Map entries for speed lookup
  const entriesMap = useMemo(() => {
    const map: Record<string, number> = {};
    normalizedEntries.forEach((entry) => {
      map[`${entry.estagiarioId}_${entry.date}`] = entry.count;
    });
    return map;
  }, [normalizedEntries]);

  const maxDailyCountInMonth = useMemo(() => {
    let max = 0;
    Object.keys(entriesMap).forEach((key) => {
      if (key.includes(selectedMonth)) {
        if (entriesMap[key] > max) max = entriesMap[key];
      }
    });
    return max;
  }, [entriesMap, selectedMonth]);

  const getHeatmapColor = (count: number | undefined, maxCount: number) => {
    if (!count) return "bg-slate-900/[0.04] text-slate-400 font-normal";
    if (maxCount === 0)
      return "bg-indigo-100 text-indigo-900 shadow-inner border border-indigo-200";

    const intensity = count / maxCount;
    if (intensity >= 0.8)
      return "bg-indigo-600 text-white font-bold border border-indigo-700 shadow-inner";
    if (intensity >= 0.6)
      return "bg-indigo-500 text-white font-bold border border-indigo-600 shadow-inner";
    if (intensity >= 0.4)
      return "bg-indigo-400 text-white font-bold border border-indigo-500 shadow-inner";
    if (intensity >= 0.2)
      return "bg-indigo-300 text-indigo-900 font-bold border border-indigo-400 shadow-inner";
    return "bg-indigo-100 text-indigo-800 font-bold border border-indigo-200 shadow-inner";
  };

  // Compute calculated values per Estagiario
  const parsedEstagiariosData = useMemo(() => {
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local time

    return estagiarios.map((estagiario) => {
      // Find entries for this estagiario in the selected month
      const filteredEntries = normalizedEntries.filter(
        (e) =>
          e.estagiarioId === estagiario.id && e.date.startsWith(selectedMonth),
      );

      const totalAnalyzed = filteredEntries.reduce(
        (sum, item) => sum + item.count,
        0,
      );

      // Para fins de cálculo de média e dias trabalhados, desconsideramos fim de semana
      const isWeekend = (dateStr: string) => {
        const [y, m, d] = dateStr.split("-").map(Number);
        const day = new Date(y, m - 1, d).getDay();
        return day === 0 || day === 6;
      };

      const weekdayEntries = filteredEntries.filter(e => !isWeekend(e.date));
      const totalAnalyzedWeekdays = weekdayEntries.reduce((sum, item) => sum + item.count, 0);

      const daysWorked = weekdayEntries.filter(
        (item) => item.count > 0,
      ).length;
      const averagePerDay =
        daysWorked > 0 ? Number((totalAnalyzedWeekdays / daysWorked).toFixed(1)) : 0;

      const todayEntry = normalizedEntries.find(
        (e) => e.estagiarioId === estagiario.id && e.date === todayStr,
      );
      const todayAnalyzed = todayEntry ? todayEntry.count : 0;

      const detailEntry = normalizedEntries.find(
        (e) => e.estagiarioId === estagiario.id && e.date === selectedDetailDate,
      );
      const detailAnalyzed = detailEntry ? detailEntry.count : 0;
      const detailTypeBreakdown: Record<string, number> = detailEntry?.typeBreakdown && Object.keys(detailEntry.typeBreakdown).length > 0
        ? detailEntry.typeBreakdown
        : {};

      const sector =
        estagiario.sector || "público";
      const dailyGoal = estagiario.dailyGoal ?? 25;
      const daysMeetingGoal = filteredEntries.filter(
        (item) => item.count >= dailyGoal,
      ).length;
      const goalProgressRatio =
        dailyGoal > 0
          ? Number(((averagePerDay / dailyGoal) * 100).toFixed(1))
          : 0;

      // Determine status badge: can be based on goalProgressRatio!
      // If goalProgress >= 100% -> ALTO
      // If goalProgress >= 70% -> NORMAL
      // Else -> ATENÇÃO
      let status: "ALTO" | "NORMAL" | "ATENÇÃO" = "NORMAL";
      const ratio = dailyGoal > 0 ? (averagePerDay / dailyGoal) * 100 : 0;
      if (ratio >= 100 && totalAnalyzed > 0) status = "ALTO";
      else if (ratio < 70 || totalAnalyzed === 0) status = "ATENÇÃO";

      const entriesList = filteredEntries.filter(entry => {
        if (isWeekend(entry.date)) {
          return entry.count > 0;
        }
        return true;
      });

      return {
        ...estagiario,
        sector,
        dailyGoal,
        daysMeetingGoal,
        goalProgressRatio:
          dailyGoal > 0
            ? Number(((averagePerDay / dailyGoal) * 100).toFixed(1))
            : 0,
        totalAnalyzed,
        todayAnalyzed,
        detailAnalyzed,
        detailTypeBreakdown,
        daysWorked,
        averagePerDay,
        status,
        entriesList,
      };
    });
  }, [estagiarios, normalizedEntries, selectedMonth, selectedDetailDate]);

  // Total de processos do dia selecionado
  const totalDayAnalyzed = useMemo(() => {
    return parsedEstagiariosData.reduce((sum, est) => sum + est.detailAnalyzed, 0);
  }, [parsedEstagiariosData]);

  // Global aggregate metrics
  const globalMetrics = useMemo(() => {
    const filteredEntries = normalizedEntries.filter((e) =>
      e.date.startsWith(selectedMonth),
    );
    const totalAnalyzed = filteredEntries.reduce(
      (sum, item) => sum + item.count,
      0,
    );

    // Previous Month Comparison
    let [y, m] = selectedMonth.split("-");
    let prevM = parseInt(m, 10) - 1;
    let prevY = parseInt(y, 10);
    if (prevM === 0) {
      prevM = 12;
      prevY -= 1;
    }
    const prevMonthStr = `${prevY}-${String(prevM).padStart(2, "0")}`;
    const previousMonthEntries = normalizedEntries.filter((e) =>
      e.date.startsWith(prevMonthStr),
    );
    const previousMonthTotalAnalyzed = previousMonthEntries.reduce(
      (sum, item) => sum + item.count,
      0,
    );

    let monthGrowth = 0;
    if (previousMonthTotalAnalyzed > 0) {
      monthGrowth =
        ((totalAnalyzed - previousMonthTotalAnalyzed) /
          previousMonthTotalAnalyzed) *
        100;
    } else if (totalAnalyzed > 0) {
      monthGrowth = 100;
    }

    // Count active estagiarios (who analyzed > 0 cases this month)
    const activeEstagiarios = parsedEstagiariosData.filter(
      (a) => a.totalAnalyzed > 0,
    );
    const activeCount = activeEstagiarios.length;

    // Total registered estagiarios
    const totalEstagiarios = estagiarios.length;

    // Average processes analyzed per active estagiario
    const averagePerEstagiario =
      activeCount > 0 ? Number((totalAnalyzed / activeCount).toFixed(1)) : 0;

    // Team Daily Goal (Sum of all active interns' daily goals)
    const teamDailyGoal = activeEstagiarios.reduce(
      (sum, item) => sum + (item.dailyGoal || 0),
      0,
    );

    return {
      totalAnalyzed,
      previousMonthTotalAnalyzed,
      monthGrowth,
      activeCount,
      totalEstagiarios,
      averagePerEstagiario,
      teamDailyGoal,
    };
  }, [normalizedEntries, selectedMonth, parsedEstagiariosData, estagiarios]);

  // Listed Estagiarios, filtered by query
  const filteredEstagiariosData = useMemo(() => {
    let result = parsedEstagiariosData;
    if (filterQuery.trim()) {
      const queryLower = filterQuery.toLowerCase();
      result = result.filter((item) =>
        item.name.toLowerCase().includes(queryLower),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      const dir = teamSortConfig.dir === "asc" ? 1 : -1;
      let valA: any = a[teamSortConfig.key as keyof typeof a];
      let valB: any = b[teamSortConfig.key as keyof typeof b];

      if (valA === undefined) valA = 0;
      if (valB === undefined) valB = 0;

      if (teamSortConfig.key === "status") {
        const score = {
          "Bateu a Meta": 3,
          Atenção: 2,
          "Abaixo da Meta": 1,
          Inativo: 0,
        };
        valA = score[a.status as keyof typeof score] ?? 0;
        valB = score[b.status as keyof typeof score] ?? 0;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return valA.localeCompare(valB) * dir;
      }
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });

    return result;
  }, [parsedEstagiariosData, filterQuery, teamSortConfig]);

  const handleTeamSort = (key: string) => {
    setTeamSortConfig((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: key === "name" ? "asc" : "desc" };
    });
  };

  // Statistics for progress bars (resources split projection based on totals)
  const categorySplit = useMemo(() => {
    const total = globalMetrics.totalAnalyzed || 1;
    const sectorSums: Record<string, number> = {
      "público": 0,
      "privado 1": 0,
      "privado 2": 0,
      "privado 3": 0,
      "crime": 0
    };
    parsedEstagiariosData.forEach((e) => {
      const s = e.sector || "público";
      if (sectorSums[s] !== undefined) {
        sectorSums[s] += e.totalAnalyzed || 0;
      }
    });

    const colors: Record<string, string> = {
      "público": "bg-blue-600",
      "privado 1": "bg-sky-400",
      "privado 2": "bg-teal-400",
      "privado 3": "bg-emerald-500",
      "crime": "bg-purple-500"
    };

    return Object.entries(sectorSums).map(([name, count]) => {
      const pct = Math.round((count / total) * 100);
      return {
        name: name.toUpperCase(),
        pct,
        color: colors[name] || "bg-slate-500",
      };
    });
  }, [globalMetrics.totalAnalyzed, parsedEstagiariosData]);

  // Daily Trends for the active month (Recharts)
  const dailyTrendsData = useMemo(() => {
    const map = new Map<string, number>();

    // Find how many days in selected month
    const [y, m] = selectedMonth.split("-");
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
      const dStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      map.set(dStr, 0);
    }

    const filteredEntries = normalizedEntries.filter((e) =>
      e.date.startsWith(selectedMonth),
    );
    for (const e of filteredEntries) {
      if (map.has(e.date)) {
        map.set(e.date, (map.get(e.date) || 0) + e.count);
      }
    }

    return Array.from(map.entries()).map(([date, count]) => {
      const day = parseInt(date.split("-")[2], 10);
      return {
        dia: String(day).padStart(2, "0"),
        total: count,
      };
    });
  }, [normalizedEntries, selectedMonth]);

  // Feitos por dia pela equipe com média por assessor ativo
  const dailyTeamDoneData = useMemo(() => {
    if (!selectedMonth) return [];
    const [y, m] = selectedMonth.split("-");
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    const data = [];
    const isWeekend = (dateStr: string) => {
      const [yy, mm, dd] = dateStr.split("-").map(Number);
      const day = new Date(yy, mm - 1, dd).getDay();
      return day === 0 || day === 6;
    };

    for (let i = 1; i <= daysInMonth; i++) {
      const dStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      
      const dayEntries = normalizedEntries.filter(e => e.date === dStr);
      const totalCount = dayEntries.reduce((sum, e) => sum + e.count, 0);
      const activeAssessors = dayEntries.filter(e => e.count > 0).length;
      
      const media = activeAssessors > 0 ? Number((totalCount / activeAssessors).toFixed(1)) : 0;
      
      const dayOfWeekNum = new Date(year, month - 1, i).getDay();
      const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const dayOfWeekLabel = weekDays[dayOfWeekNum];

      data.push({
        dateStr: dStr,
        dia: String(i).padStart(2, "0"),
        dayOfWeekLabel,
        total: totalCount,
        media,
        isWeekend: dayOfWeekNum === 0 || dayOfWeekNum === 6
      });
    }

    return data;
  }, [normalizedEntries, selectedMonth]);

  // Weekly Ranking List (Sorted descending by total productivity in the week containing selectedDetailDate)
  const weeklyRankingList = useMemo(() => {
    if (!selectedDetailDate) return [];
    
    // Parse the selected detail date (e.g., "2026-06-25")
    const d = new Date(selectedDetailDate + "T12:00:00");
    const dayOfWeek = d.getDay(); // 0 (Sunday) to 6 (Saturday)
    
    const startOfWeek = new Date(d.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
    const endOfWeek = new Date(d.getTime() + (6 - dayOfWeek) * 24 * 60 * 60 * 1000);
    
    const startStr = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, "0")}-${String(startOfWeek.getDate()).padStart(2, "0")}`;
    const endStr = `${endOfWeek.getFullYear()}-${String(endOfWeek.getMonth() + 1).padStart(2, "0")}-${String(endOfWeek.getDate()).padStart(2, "0")}`;
    
    // Filter entries within this week
    const weekEntries = normalizedEntries.filter(
      (e) => e.date >= startStr && e.date <= endStr
    );
    
    // Sum counts per estagiario
    const countsMap: Record<string, number> = {};
    const totalForPctMap: Record<string, number> = {};
    
    weekEntries.forEach((e) => {
      const entryProductivity = e.count;
      countsMap[e.estagiarioId] = (countsMap[e.estagiarioId] || 0) + entryProductivity;
      totalForPctMap[e.estagiarioId] = (totalForPctMap[e.estagiarioId] || 0) + e.count;
    });

    // Map to list and sort descending
    return estagiarios
      .map((est) => {
        const count = countsMap[est.id] || 0;
        
        return {
          id: est.id,
          name: est.name,
          count,
          breakdown: [] as { type: string; pct: number; emoji: string }[],
          totalForPct: totalForPctMap[est.id] || 0,
        };
      })
      .filter((e) => e.count > 0 || e.totalForPct > 0)
      .sort((a, b) => b.count - a.count)
      .map((est, index) => ({
        ...est,
        rank: index + 1,
      }));
  }, [normalizedEntries, selectedDetailDate, estagiarios]);

  const weeklyRangeLabel = useMemo(() => {
    if (!selectedDetailDate) return "";
    const d = new Date(selectedDetailDate + "T12:00:00");
    const dayOfWeek = d.getDay();
    const startOfWeek = new Date(d.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
    const endOfWeek = new Date(d.getTime() + (6 - dayOfWeek) * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(startOfWeek.getDate())}/${pad(startOfWeek.getMonth() + 1)} a ${pad(endOfWeek.getDate())}/${pad(endOfWeek.getMonth() + 1)}`;
  }, [selectedDetailDate]);

  // Distribution by Process Type — carrega dos processos detalhados salvos nas settings
  const distributionChartData = useMemo(() => {
    // Tipos de processo e suas cores premium
    const PROCESS_TYPES: Record<string, { label: string; fill: string }> = {
      CV:  { label: "CV",  fill: "#2563eb" }, // blue-600 (cível)
      RCV: { label: "RCV", fill: "#3b82f6" }, // blue-500
      DCV: { label: "DCV", fill: "#60a5fa" }, // blue-400
      CR:  { label: "CR",  fill: "#7c3aed" }, // violet-600 (crime)
      RCR: { label: "RCR", fill: "#8b5cf6" }, // violet-500
      DCR: { label: "DCR", fill: "#a78bfa" }, // violet-400
      REDCV: { label: "REDCV", fill: "#ef4444" }, // red-500 (redistribuição cível)
      REDCR: { label: "REDCR", fill: "#dc2626" }, // red-600 (redistribuição crime)
      REVCR: { label: "REVCR", fill: "#f87171" }, // red-400 (revisão crime)
    };

    const counts: Record<string, number> = {};
    Object.keys(PROCESS_TYPES).forEach(t => { counts[t] = 0; });

    // Agrega de normalizedEntries (typeBreakdown) — única fonte
    normalizedEntries
      .filter((e) => e.date.startsWith(selectedMonth))
      .forEach((e) => {
        if (e.typeBreakdown) {
          Object.entries(e.typeBreakdown).forEach(([tipo, qtd]) => {
            const key = tipo.toUpperCase();
            if (counts[key] !== undefined) counts[key] += Number(qtd);
          });
        }
      });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    // Se não há processos detalhados, fallback para distribuição por setor
    if (total === 0) {
      const sumBySector: Record<string, number> = {
        "público": 0,
        "privado 1": 0,
        "privado 2": 0,
        "privado 3": 0,
        "crime": 0
      };
      parsedEstagiariosData.forEach((e) => {
        const s = e.sector || "público";
        if (sumBySector[s] !== undefined) sumBySector[s] += e.totalAnalyzed || 0;
      });
      const colors: Record<string, string> = {
        "público": "#2563eb",
        "privado 1": "#3b82f6",
        "privado 2": "#60a5fa",
        "privado 3": "#93c5fd",
        "crime": "#7c3aed"
      };
      return Object.entries(sumBySector)
        .map(([sec, val]) => ({
          name: sec.toUpperCase(),
          value: val,
          fill: colors[sec] || "#64748b"
        }))
        .filter((x) => x.value > 0);
    }

    return Object.entries(PROCESS_TYPES)
      .map(([key, meta]) => ({ name: meta.label, value: counts[key] || 0, fill: meta.fill }))
      .filter((x) => x.value > 0);
  }, [parsedEstagiariosData, selectedMonth, normalizedEntries]);

  // List of all active month entries sorted chronologically (newest first)
  const chronologicalEntries = useMemo(() => {
    const list = normalizedEntries.filter((e) => e.date.startsWith(selectedMonth));
    list.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      const nameA =
        estagiarios.find((as) => as.id === a.estagiarioId)?.name || "";
      const nameB =
        estagiarios.find((as) => as.id === b.estagiarioId)?.name || "";
      return nameA.localeCompare(nameB);
    });
    return list;
  }, [normalizedEntries, selectedMonth, estagiarios]);

  // Search-filtered list of chronological entries
  const filteredChronologicalEntries = useMemo(() => {
    if (!filterQuery.trim()) return chronologicalEntries;
    const queryLower = filterQuery.toLowerCase();
    return chronologicalEntries.filter((entry) => {
      const estagiarioName =
        estagiarios.find((as) => as.id === entry.estagiarioId)?.name || "";
      return (
        estagiarioName.toLowerCase().includes(queryLower) ||
        entry.date.includes(queryLower)
      );
    });
  }, [chronologicalEntries, filterQuery, estagiarios]);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedMonth, filterQuery]);

  const paginatedEntries = useMemo(() => {
    const start = (historyPage - 1) * itemsPerPage;
    return filteredChronologicalEntries.slice(start, start + itemsPerPage);
  }, [filteredChronologicalEntries, historyPage]);
  const totalHistoryPages =
    Math.ceil(filteredChronologicalEntries.length / itemsPerPage) || 1;

  // Trigger quick edit from Planilha/Matrix cells
  const handleCellClick = (estagiarioId: string, date: string) => {
    const lookupKey = `${estagiarioId}_${date}`;
    const count = entriesMap[lookupKey] ?? 0;

    setFormEstagiarioId(estagiarioId);
    setFormDate(date);
    setFormCount(count);
    setFormEditingId(lookupKey);
    setIsLaunchModalOpen(true);
  };

  // Reset/Empty cell completely
  const handleCellClear = async (estagiarioId: string, date: string) => {
    const lookupKey = `${estagiarioId}_${date}`;
    if (entriesMap[lookupKey] === undefined) return;

    try {
      await deleteDoc(doc(db, "productivityEntries", lookupKey));
      setEntries((prev) => prev.filter((item) => item.id !== lookupKey));
    } catch (err) {
      console.error(err);
    }
  };

  const renderSortIcon = (key: string) => {
    if (teamSortConfig.key !== key)
      return (
        <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      );
    return teamSortConfig.dir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-indigo-500" />
    ) : (
      <ChevronDown className="w-3 h-3 text-indigo-500" />
    );
  };

  if (isAuthLoading) {
    return (
      <div className="flex h-screen bg-slate-50 text-slate-900 items-center justify-center font-sans">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
            Verificando Autenticação...
          </p>
        </div>
      </div>
    );
  }

  // 1. Tela de Login Premium
  if (!googleUser) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white items-center justify-center font-sans relative p-4 overflow-hidden">
        {/* Decorative Blurred Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none animate-pulse duration-[6000ms]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-sky-600/10 blur-[120px] pointer-events-none animate-pulse duration-[8000ms]"></div>

        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 sm:p-10 shadow-2xl flex flex-col items-center relative z-10 text-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-sky-400 rounded-2xl flex items-center justify-center font-black text-3xl tracking-tight shadow-lg shadow-indigo-500/20 mb-8 border border-white/10">
            V
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Desempenho <span className="bg-gradient-to-r from-indigo-400 to-sky-400 bg-clip-text text-transparent">AR</span>
          </h2>
          <p className="text-xs font-semibold tracking-widest text-indigo-300 uppercase mb-8">
            1ª Vice-Presidência TJPR
          </p>

          <p className="text-sm text-slate-400 mb-8 leading-relaxed">
            Painel de controle e produtividade de assessores da Assessoria de Recursos, dividido por setores.
          </p>

          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingInGoogle}
            className="w-full py-3.5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer shadow-lg active:scale-[0.98] border border-white/10"
          >
            {isLoggingInGoogle ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
            ) : (
              <svg
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                className="w-5 h-5 block"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                ></path>
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                ></path>
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                ></path>
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                ></path>
              </svg>
            )}
            <span>{isLoggingInGoogle ? "CONECTANDO..." : "ENTRAR COM O GOOGLE"}</span>
          </button>

          <button
            onClick={handleMockLogin}
            className="w-full mt-3 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.98] border border-indigo-500/20"
          >
            <span>ENTRAR EM MODO DE TESTE (LOCAL)</span>
          </button>

          <div className="mt-10 pt-6 border-t border-white/5 w-full">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed">
              Sistema Restrito • Atualizado em Tempo Real
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Tela de Verificação de Acesso (Carregamento da permissão da Planilha)
  if (spreadsheetUrl && hasSpreadsheetAccess === null) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white items-center justify-center font-sans relative p-4 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-sky-600/10 blur-[120px] pointer-events-none"></div>

        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 sm:p-10 shadow-2xl flex flex-col items-center relative z-10 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-400 mb-6"></div>
          <h3 className="text-lg font-bold tracking-tight mb-2">Verificando Permissão de Acesso</h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-6">
            Aguarde enquanto verificamos se a conta <span className="text-indigo-300 font-bold">{googleUser.email}</span> possui acesso à planilha vinculada do Google Sheets...
          </p>
          <button
            onClick={handleGoogleLogout}
            className="px-4 py-2 border border-white/10 text-white/60 hover:text-white rounded-lg text-xs font-bold hover:bg-white/5 transition-all cursor-pointer"
          >
            Cancelar e Sair
          </button>
        </div>
      </div>
    );
  }



  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans selection:bg-slate-900 selection:text-white overflow-hidden">
      {/* Sidebar - Dashboard Style */}
      <aside className="w-16 sm:w-20 bg-slate-950 text-slate-400 flex flex-col items-center py-6 border-r border-slate-800 z-20 shrink-0">
        <div className="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center font-black text-xl tracking-tight shadow-md mb-8">
          V
        </div>

        <nav className="flex flex-col gap-4 flex-1 w-full items-center">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-indigo-500/20 text-indigo-400"
                : "hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Dashboard"
          >
            <BarChart2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab("desempenho")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              activeTab === "desempenho"
                ? "bg-amber-500/20 text-amber-400"
                : "hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Desempenho da Equipe"
          >
            <Award className="w-5 h-5" />
          </button>

        </nav>

        <div className="mt-auto flex flex-col gap-4 items-center">
          <button
            onClick={() => setIsSheetsModalOpen(true)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              spreadsheetUrl
                ? "bg-emerald-500/20 text-emerald-400"
                : "hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Integração Google Sheets"
          >
            <FileText className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight uppercase leading-none text-slate-900">
                1ª Vice-Presidência
              </h1>
              <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase mt-1">
                Assessoria de Recursos • Produtividade
              </p>
            </div>
          </div>

          {/* Header Right Actions */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Dynamic Clock Section */}
            <div className="bg-slate-100/80 px-4 py-2 rounded-lg text-right hidden md:block border border-slate-200">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                {formattedDate}
              </p>
              <p className="text-sm font-black text-slate-800 tracking-wider font-mono">
                {formattedTime}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {googleUser ? (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 pl-2">
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt={googleUser.displayName || "Google User"}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full border border-slate-300"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-[9px]">
                      {googleUser.displayName?.charAt(0) || "U"}
                    </div>
                  )}
                  <div className="hidden sm:block text-left max-w-[120px]">
                    <p className="text-[10px] font-bold text-slate-850 truncate leading-none">
                      {googleUser.displayName}
                    </p>
                    <p className="text-[8px] text-emerald-600 font-bold leading-none uppercase tracking-wider mt-0.5">
                      Conta Ativa
                    </p>
                  </div>
                  <button
                    onClick={handleGoogleLogout}
                    className="px-2 py-0.5 bg-slate-150 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded text-[9px] font-bold transition-all cursor-pointer border border-slate-200"
                  >
                    Sair
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingInGoogle}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: "block", width: "14px", height: "14px" }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    ></path>
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    ></path>
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    ></path>
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    ></path>
                  </svg>
                  <span>
                    {isLoggingInGoogle ? "Conectando..." : "Entrar com Google"}
                  </span>
                </button>
              )}

              {googleUser && (
                <button
                  id="btn-novo-lancamento"
                  onClick={() => {
                    setFormEditingId(null);
                    setFormEstagiarioId(estagiarios[0]?.id || "");
                    setFormDate(new Date().toISOString().split("T")[0]);
                    setFormCount(0);
                    setIsLaunchModalOpen(true);
                  }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">NOVO LANÇAMENTO</span>
                  <span className="sm:hidden">NOVO</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Arena */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 w-full mx-auto flex flex-col gap-6">
            {/* Banner de Sincronização Pausada / Erro de Planilha */}
            {spreadsheetUrl && hasSpreadsheetAccess === false && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm animate-fade-in shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">Sincronização com Planilha Pausada</h4>
                    <p className="text-xs text-slate-600 mt-0.5 leading-normal">
                      A conta <span className="font-bold text-amber-950">{googleUser?.email}</span> não pôde sincronizar com o Sheets. Verifique o link ou faça login novamente.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => triggerSheetsSync(spreadsheetUrl, estagiarios, true)}
                    disabled={syncingSheets}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-750 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-55"
                  >
                    {syncingSheets ? `Sincronizando (${syncDuration.toFixed(1)}s)...` : "Tentar Novamente"}
                  </button>
                  <button
                    onClick={handleGoogleLogin}
                    disabled={isLoggingInGoogle}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Reconectar Google
                  </button>
                </div>
              </div>
            )}

            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex bg-slate-100 p-1 rounded-lg gap-0.5">
                  <button
                    onClick={() => setActiveTab("dashboard")}
                    className={`px-3 py-2 rounded-md text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                      activeTab === "dashboard"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    DASHBOARD
                  </button>
                  <button
                    onClick={() => setActiveTab("desempenho")}
                    className={`px-3 py-2 rounded-md text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                      activeTab === "desempenho"
                        ? "bg-white text-amber-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    DESEMPENHO
                  </button>

                </div>

                <div className="h-6 w-[1px] bg-slate-200"></div>

                {/* Selected Month selector */}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <input
                    type="month"
                    id="select-month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent border-0 text-sm font-bold text-slate-800 focus:ring-0 cursor-pointer outline-none"
                  />
                </div>

                {/* Quick Available Months Navigation */}
                {availableMonths.length > 1 && (
                  <div className="hidden lg:flex items-center gap-1.5 ml-1 pl-3 border-l border-slate-200">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mr-0.5">
                      Meses com Dados:
                    </span>
                    {availableMonths.map((m) => {
                      const [y, mm] = m.split("-");
                      const monthNames: Record<string, string> = {
                        "01": "Jan",
                        "02": "Fev",
                        "03": "Mar",
                        "04": "Abr",
                        "05": "Mai",
                        "06": "Jun",
                        "07": "Jul",
                        "08": "Ago",
                        "09": "Set",
                        "10": "Out",
                        "11": "Nov",
                        "12": "Dez",
                      };
                      const label = `${monthNames[mm] || mm}/${y.substring(2)}`;
                      const isActive = selectedMonth === m;
                      return (
                        <button
                          key={m}
                          onClick={() => setSelectedMonth(m)}
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                            isActive
                              ? "bg-slate-900 text-white shadow-sm"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-850"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Search */}
              <div className="relative max-w-xs w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por assessor..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-lg text-xs outline-none transition-all"
                />
              </div>
            </div>

            {/* Key Metrics row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:border-slate-300 transition-all">
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">
                  Total Analisado
                </p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-light text-slate-800">
                    {globalMetrics.totalAnalyzed.toLocaleString("pt-BR")}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      globalMetrics.monthGrowth > 0
                        ? "bg-emerald-50 text-emerald-700"
                        : globalMetrics.monthGrowth < 0
                          ? "bg-red-50 text-red-700"
                          : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {globalMetrics.monthGrowth > 0 ? "+" : ""}
                    {globalMetrics.monthGrowth.toFixed(1)}% m/m
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:border-slate-300 transition-all">
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">
                  Assessores Ativos
                </p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-light text-slate-800">
                    {globalMetrics.activeCount}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    de {globalMetrics.totalEstagiarios} cadastrados
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:border-slate-300 transition-all">
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">
                  Média p/ Assessor Ativo
                </p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-light text-slate-800">
                    {globalMetrics.averagePerEstagiario.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    processos / mês
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:border-slate-300 transition-all">
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">
                  Meta Diária (Equipe)
                </p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-light text-slate-800">
                    {globalMetrics.teamDailyGoal}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    processos / dia
                  </span>
                </div>
              </div>
            </div>

            {/* Resumo de Produtividade por Setores */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {(() => {
                const sectorSums: Record<string, number> = {
                  "público": 0,
                  "privado 1": 0,
                  "privado 2": 0,
                  "privado 3": 0,
                  "crime": 0
                };
                parsedEstagiariosData.forEach((e) => {
                  const s = e.sector || "público";
                  if (sectorSums[s] !== undefined) {
                    sectorSums[s] += e.totalAnalyzed || 0;
                  }
                });
                
                const sectorGradients: Record<string, string> = {
                  "público": "from-blue-500 to-indigo-600",
                  "privado 1": "from-sky-400 to-blue-500",
                  "privado 2": "from-teal-400 to-emerald-500",
                  "privado 3": "from-emerald-500 to-green-600",
                  "crime": "from-purple-500 to-violet-600"
                };

                return Object.entries(sectorSums).map(([sec, val]) => (
                  <button
                    key={sec}
                    onClick={() => setSelectedSectorDetail(sec)}
                    className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:border-slate-350 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col justify-between text-left relative overflow-hidden cursor-pointer w-full"
                  >
                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${sectorGradients[sec] || "from-slate-400 to-slate-500"}`}></div>
                    <div>
                      <p className="text-[9px] text-slate-400 font-extrabold tracking-widest uppercase mb-1 capitalize">
                        Setor {sec}
                      </p>
                      <span className="text-2xl font-light text-slate-800 font-mono">
                        {val.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-1 font-semibold uppercase tracking-wider">
                      Clique p/ Detalhes
                    </p>
                  </button>
                ));
              })()}
            </div>

            {/* Dashboard Layout vs Matrix Layout Grid */}
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-xl shadow-sm"
                >
                  <div className="w-10 h-10 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm font-semibold text-slate-500 mt-4">
                    Carregando dados dos assessores...
                  </p>
                </motion.div>
              ) : activeTab === "dashboard" && selectedSectorDetail ? (
                <motion.div
                  key="sector-detail-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col gap-6"
                >
                  {/* Header do Setor */}
                  {(() => {
                    const sectorGradients: Record<string, string> = {
                      "público": "from-blue-500 to-indigo-600",
                      "privado 1": "from-sky-400 to-blue-500",
                      "privado 2": "from-teal-400 to-emerald-500",
                      "privado 3": "from-emerald-500 to-green-600",
                      "crime": "from-purple-500 to-violet-600"
                    };
                    const gradient = sectorGradients[selectedSectorDetail] || "from-slate-500 to-slate-600";
                    
                    const assessorsInSector = parsedEstagiariosData.filter(
                      (e) => (e.sector || "público") === selectedSectorDetail
                    );

                    const totalSectorAnalyzed = assessorsInSector.reduce((sum, e) => sum + (e.totalAnalyzed || 0), 0);

                    return (
                      <>
                        <div className={`bg-gradient-to-r ${gradient} text-white px-6 py-5 rounded-2xl shadow-md flex justify-between items-center relative overflow-hidden`}>
                          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                          <div>
                            <button
                              onClick={() => setSelectedSectorDetail(null)}
                              className="text-white/80 hover:text-white flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer mb-2 bg-white/10 px-2.5 py-1 rounded-lg border border-white/10"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                              Voltar para Dashboard
                            </button>
                            <h3 className="text-2xl font-black uppercase tracking-tight capitalize mt-1">
                              Setor {selectedSectorDetail}
                            </h3>
                          </div>
                          
                          {/* Resumo Rápido */}
                          <div className="flex gap-4 sm:gap-6 text-right">
                            <div className="hidden sm:block">
                              <span className="text-[10px] text-white/70 font-extrabold uppercase tracking-wider block">Assessores</span>
                              <span className="text-xl font-bold font-mono">{assessorsInSector.length}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-white/70 font-extrabold uppercase tracking-wider block">Total Mês</span>
                              <span className="text-xl font-bold font-mono">{totalSectorAnalyzed.toLocaleString("pt-BR")}</span>
                            </div>
                          </div>
                        </div>

                        {/* Métricas e Estatísticas do Setor */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                              T
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase block">Total Produzido</span>
                              <span className="text-2xl font-black text-slate-800 font-mono mt-0.5 block">
                                {totalSectorAnalyzed.toLocaleString("pt-BR")}
                              </span>
                            </div>
                          </div>
                          
                          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                              A
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase block">Assessores Ativos</span>
                              <span className="text-2xl font-black text-slate-800 font-mono mt-0.5 block">
                                {assessorsInSector.length}
                              </span>
                            </div>
                          </div>

                          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                              M
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase block">Média por Assessor</span>
                              <span className="text-2xl font-black text-slate-800 font-mono mt-0.5 block">
                                {assessorsInSector.length > 0 
                                  ? Math.round(totalSectorAnalyzed / assessorsInSector.length).toLocaleString("pt-BR") 
                                  : 0}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* ── Gráficos do Setor ── */}
                        {(() => {
                          // Dados: IDs dos assessores do setor
                          const sectorAssessorIds = new Set(assessorsInSector.map(a => a.id));

                          // 1. Produção diária do setor no mês
                          const [ys, ms] = selectedMonth.split("-");
                          const yearS = parseInt(ys, 10);
                          const monthS = parseInt(ms, 10);
                          const daysInMonthS = new Date(yearS, monthS, 0).getDate();
                          const sectorDailyMap = new Map<string, number>();
                          for (let i = 1; i <= daysInMonthS; i++) {
                            const d = `${ys}-${String(monthS).padStart(2,"0")}-${String(i).padStart(2,"0")}`;
                            sectorDailyMap.set(d, 0);
                          }
                          normalizedEntries
                            .filter(e => e.date.startsWith(selectedMonth) && sectorAssessorIds.has(e.estagiarioId))
                            .forEach(e => { sectorDailyMap.set(e.date, (sectorDailyMap.get(e.date) || 0) + e.count); });
                          const sectorDailyData = Array.from(sectorDailyMap.entries()).map(([date, count]) => ({
                            dia: String(parseInt(date.split("-")[2], 10)).padStart(2, "0"),
                            total: count,
                          }));

                          // Meta diária do setor = soma das metas diárias dos assessores
                          const sectorDailyGoal = assessorsInSector.reduce((s, a) => s + (a.dailyGoal || 25), 0);

                          // 2. Ranking de assessores (totalAnalyzed, barra horizontal)
                          const sectorRankingData = [...assessorsInSector]
                            .sort((a, b) => (b.totalAnalyzed || 0) - (a.totalAnalyzed || 0))
                            .map(a => ({
                              name: a.name.split(" ")[0], // primeiro nome
                              fullName: a.name,
                              total: a.totalAnalyzed || 0,
                              meta: (a.dailyGoal || 25) * 20, // ~20 dias úteis
                            }));

                          // 3. Distribuição por tipo de processo no setor
                          const PROCESS_COLORS: Record<string, string> = {
                            CV:    "#2563eb", RCV: "#3b82f6", DCV: "#60a5fa",
                            CR:    "#7c3aed", RCR: "#8b5cf6", DCR: "#a78bfa",
                            REDCV: "#ef4444", REDCR: "#dc2626", REVCR: "#f87171",
                          };
                          const typeCountsS: Record<string, number> = {};
                          normalizedEntries
                            .filter(e => e.date.startsWith(selectedMonth) && sectorAssessorIds.has(e.estagiarioId))
                            .forEach(e => {
                              if (e.typeBreakdown) {
                                Object.entries(e.typeBreakdown).forEach(([t, q]) => {
                                  const k = t.toUpperCase();
                                  typeCountsS[k] = (typeCountsS[k] || 0) + Number(q);
                                });
                              }
                            });
                          const sectorTypeData = Object.entries(typeCountsS)
                            .filter(([, v]) => v > 0)
                            .map(([type, value]) => ({ name: type, value, fill: PROCESS_COLORS[type] || "#94a3b8" }))
                            .sort((a, b) => b.value - a.value);

                          // Cores do setor para os gráficos
                          const sectorColorMap: Record<string, { bar: string; line: string }> = {
                            "público":   { bar: "#3b82f6", line: "#1d4ed8" },
                            "privado 1": { bar: "#38bdf8", line: "#0284c7" },
                            "privado 2": { bar: "#2dd4bf", line: "#0d9488" },
                            "privado 3": { bar: "#34d399", line: "#059669" },
                            "crime":     { bar: "#a78bfa", line: "#7c3aed" },
                          };
                          const sCol = sectorColorMap[selectedSectorDetail!] || { bar: "#6366f1", line: "#4338ca" };
                          const hasTypeData = sectorTypeData.length > 0;

                          return (
                            <div className="flex flex-col gap-6">
                              {/* Gráfico 1: Produção Diária do Setor */}
                              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                                <div className="flex items-center gap-2 mb-4">
                                  <TrendingUp className="w-4 h-4" style={{ color: sCol.line }} />
                                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                    Produção Diária — Setor {selectedSectorDetail}
                                  </h4>
                                  <span className="ml-auto text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                                    {selectedMonth.split("-").reverse().join("/")}
                                  </span>
                                </div>
                                <div className="h-[220px] w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={sectorDailyData} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                      <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
                                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                                      <Tooltip
                                        contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                                        formatter={(val: number) => [val.toLocaleString("pt-BR"), "Processos"]}
                                        labelFormatter={(l) => `Dia ${l}`}
                                      />
                                      <Bar dataKey="total" fill={sCol.bar} radius={[4, 4, 0, 0]} maxBarSize={28} opacity={0.85} />
                                      {sectorDailyGoal > 0 && (
                                        <Line
                                          type="monotone"
                                          dataKey={() => sectorDailyGoal}
                                          stroke={sCol.line}
                                          strokeDasharray="5 4"
                                          strokeWidth={1.5}
                                          dot={false}
                                          name="Meta Diária"
                                        />
                                      )}
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>
                                {sectorDailyGoal > 0 && (
                                  <div className="flex items-center gap-1.5 mt-2">
                                    <span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: sCol.line }}></span>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Meta diária do setor: {sectorDailyGoal} proc.</span>
                                  </div>
                                )}
                              </div>

                              {/* Gráficos 2 e 3: Ranking + Tipos */}
                              <div className={`grid gap-6 ${hasTypeData ? "grid-cols-1 lg:grid-cols-[1.4fr_1fr]" : "grid-cols-1"}`}>
                                {/* Gráfico 2: Ranking de Assessores */}
                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                                  <div className="flex items-center gap-2 mb-4">
                                    <BarChart2 className="w-4 h-4" style={{ color: sCol.line }} />
                                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Ranking de Assessores</h4>
                                  </div>
                                  {sectorRankingData.length === 0 ? (
                                    <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Sem dados neste mês.</div>
                                  ) : (
                                    <div className="h-[200px] w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                          layout="vertical"
                                          data={sectorRankingData}
                                          margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                          <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                                          <YAxis
                                            type="category"
                                            dataKey="name"
                                            width={72}
                                            tick={{ fontSize: 10, fill: "#475569", fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                          />
                                          <Tooltip
                                            contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}
                                            formatter={(val: number, _name: string, props: any) => [
                                              `${val.toLocaleString("pt-BR")} proc.`,
                                              props.payload.fullName
                                            ]}
                                          />
                                          <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={20}>
                                            {sectorRankingData.map((_, idx) => (
                                              <Cell
                                                key={idx}
                                                fill={sCol.bar}
                                                opacity={1 - (idx / sectorRankingData.length) * 0.45}
                                              />
                                            ))}
                                          </Bar>
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  )}
                                </div>

                                {/* Gráfico 3: Distribuição por Tipo de Processo */}
                                {hasTypeData && (
                                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                      <FileText className="w-4 h-4" style={{ color: sCol.line }} />
                                      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Tipos de Processo</h4>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="h-[180px] flex-shrink-0" style={{ width: 160 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                          <PieChart>
                                            <Pie
                                              data={sectorTypeData}
                                              cx="50%"
                                              cy="50%"
                                              innerRadius={48}
                                              outerRadius={72}
                                              paddingAngle={2}
                                              dataKey="value"
                                            >
                                              {sectorTypeData.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.fill} />
                                              ))}
                                            </Pie>
                                            <Tooltip
                                              contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e2e8f0" }}
                                              formatter={(val: number) => [val.toLocaleString("pt-BR"), "proc."]}
                                            />
                                          </PieChart>
                                        </ResponsiveContainer>
                                      </div>
                                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                        {sectorTypeData.map((item) => {
                                          const totalType = sectorTypeData.reduce((s, x) => s + x.value, 0);
                                          const pct = totalType > 0 ? Math.round((item.value / totalType) * 100) : 0;
                                          return (
                                            <div key={item.name} className="flex items-center gap-2 min-w-0">
                                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.fill }}></span>
                                              <span className="text-[10px] font-black text-slate-600 uppercase flex-shrink-0 w-12">{item.name}</span>
                                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: item.fill }}></div>
                                              </div>
                                              <span className="text-[10px] font-bold text-slate-500 flex-shrink-0 w-8 text-right">{pct}%</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* ── Análise Específica do Setor ── */}
                        {(() => {
                          const sectorAssessorIds = new Set(assessorsInSector.map(a => a.id));
                          const [ys, ms] = selectedMonth.split("-");
                          const yearS = parseInt(ys, 10);
                          const monthS = parseInt(ms, 10);
                          const daysInMonthS = new Date(yearS, monthS, 0).getDate();

                          const sectorColorMap: Record<string, { bar: string; bar2: string; line: string; area: string }> = {
                            "público":   { bar: "#3b82f6", bar2: "#818cf8", line: "#1d4ed8", area: "#dbeafe" },
                            "privado 1": { bar: "#38bdf8", bar2: "#7dd3fc", line: "#0284c7", area: "#e0f2fe" },
                            "privado 2": { bar: "#2dd4bf", bar2: "#6ee7b7", line: "#0d9488", area: "#ccfbf1" },
                            "privado 3": { bar: "#34d399", bar2: "#86efac", line: "#059669", area: "#dcfce7" },
                            "crime":     { bar: "#a78bfa", bar2: "#f472b6", line: "#7c3aed", area: "#ede9fe" },
                          };
                          const sCol = sectorColorMap[selectedSectorDetail!] || { bar: "#6366f1", bar2: "#a5b4fc", line: "#4338ca", area: "#e0e7ff" };

                          // ─ PÚBLICO: Comparativo Meta vs. Realizado por assessor ─
                          if (selectedSectorDetail === "público") {
                            const metaVsRealData = [...assessorsInSector]
                              .sort((a, b) => (b.totalAnalyzed || 0) - (a.totalAnalyzed || 0))
                              .map(a => {
                                const metaMensal = (a.dailyGoal || 25) * 20; // ~20 dias úteis
                                const realizado = a.totalAnalyzed || 0;
                                const pct = metaMensal > 0 ? Math.round((realizado / metaMensal) * 100) : 0;
                                return {
                                  name: a.name.split(" ")[0],
                                  fullName: a.name,
                                  meta: metaMensal,
                                  realizado,
                                  pct,
                                };
                              });

                            const taxaCumprimento = (() => {
                              const totalMeta = metaVsRealData.reduce((s, x) => s + x.meta, 0);
                              const totalReal = metaVsRealData.reduce((s, x) => s + x.realizado, 0);
                              return totalMeta > 0 ? Math.round((totalReal / totalMeta) * 100) : 0;
                            })();

                            return (
                              <div className="bg-white border border-blue-100 rounded-xl shadow-sm p-5 ring-1 ring-blue-200/40">
                                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <Award className="w-4 h-4 text-blue-600" />
                                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                      Meta vs. Realizado — Assessores do Setor
                                    </h4>
                                  </div>
                                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                                    <span className="text-[10px] text-blue-500 font-extrabold uppercase tracking-wider">Taxa de Cumprimento do Setor:</span>
                                    <span className={`text-sm font-black ${taxaCumprimento >= 100 ? "text-emerald-600" : taxaCumprimento >= 70 ? "text-blue-700" : "text-amber-600"}`}>
                                      {taxaCumprimento}%
                                    </span>
                                  </div>
                                </div>
                                {metaVsRealData.length === 0 ? (
                                  <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Sem dados neste mês.</div>
                                ) : (
                                  <div className="h-[220px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={metaVsRealData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569", fontWeight: 700 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                          contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                                          formatter={(val: number, name: string, props: any) => [
                                            `${val.toLocaleString("pt-BR")} proc. (${props.payload.pct}%)`,
                                            name === "meta" ? "Meta Mensal (~20 dias)" : "Realizado",
                                          ]}
                                          labelFormatter={(l) => metaVsRealData.find(x => x.name === l)?.fullName || l}
                                        />
                                        <Legend
                                          wrapperStyle={{ fontSize: 10, fontWeight: 700, paddingTop: 8 }}
                                          formatter={(val) => val === "meta" ? "Meta Mensal" : "Realizado"}
                                        />
                                        <Bar dataKey="meta" fill={sCol.bar2} radius={[4, 4, 0, 0]} maxBarSize={22} opacity={0.5} name="meta" />
                                        <Bar dataKey="realizado" fill={sCol.bar} radius={[4, 4, 0, 0]} maxBarSize={22} name="realizado">
                                          {metaVsRealData.map((entry, idx) => (
                                            <Cell
                                              key={idx}
                                              fill={entry.realizado >= entry.meta ? "#10b981" : entry.realizado >= entry.meta * 0.7 ? sCol.bar : "#f59e0b"}
                                            />
                                          ))}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                )}
                                <div className="flex items-center gap-4 mt-2 flex-wrap">
                                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /><span className="text-[10px] font-bold text-slate-400 uppercase">Atingiu a meta</span></div>
                                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: sCol.bar }} /><span className="text-[10px] font-bold text-slate-400 uppercase">Acima de 70%</span></div>
                                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /><span className="text-[10px] font-bold text-slate-400 uppercase">Abaixo de 70%</span></div>
                                </div>
                              </div>
                            );
                          }

                          // ─ PRIVADO 1: Evolução Acumulada no Mês ─
                          if (selectedSectorDetail === "privado 1") {
                            let accumulated = 0;
                            const dailyMap = new Map<string, number>();
                            for (let i = 1; i <= daysInMonthS; i++) {
                              const d = `${ys}-${String(monthS).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
                              dailyMap.set(d, 0);
                            }
                            normalizedEntries
                              .filter(e => e.date.startsWith(selectedMonth) && sectorAssessorIds.has(e.estagiarioId))
                              .forEach(e => { dailyMap.set(e.date, (dailyMap.get(e.date) || 0) + e.count); });

                            const accumulatedData = Array.from(dailyMap.entries()).map(([date, count]) => {
                              accumulated += count;
                              return {
                                dia: String(parseInt(date.split("-")[2], 10)).padStart(2, "0"),
                                diario: count,
                                acumulado: accumulated,
                              };
                            });

                            const maxAccum = accumulatedData.reduce((m, x) => Math.max(m, x.acumulado), 0);

                            return (
                              <div className="bg-white border border-sky-100 rounded-xl shadow-sm p-5 ring-1 ring-sky-200/40">
                                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-sky-500" />
                                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                      Evolução Acumulada no Mês
                                    </h4>
                                  </div>
                                  <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-1.5">
                                    <span className="text-[10px] text-sky-500 font-extrabold uppercase tracking-wider">Total Acumulado:</span>
                                    <span className="text-sm font-black text-sky-700">{maxAccum.toLocaleString("pt-BR")} proc.</span>
                                  </div>
                                </div>
                                <div className="h-[220px] w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={accumulatedData} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                                      <defs>
                                        <linearGradient id="gradPriv1" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor={sCol.bar} stopOpacity={0.3} />
                                          <stop offset="95%" stopColor={sCol.bar} stopOpacity={0.02} />
                                        </linearGradient>
                                      </defs>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                      <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
                                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                                      <Tooltip
                                        contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                                        formatter={(val: number, name: string) => [val.toLocaleString("pt-BR"), name === "acumulado" ? "Acumulado" : "Diário"]}
                                        labelFormatter={(l) => `Dia ${l}`}
                                      />
                                      <Bar dataKey="diario" fill={sCol.bar2} radius={[3, 3, 0, 0]} maxBarSize={20} opacity={0.5} name="diario" />
                                      <Line type="monotone" dataKey="acumulado" stroke={sCol.line} strokeWidth={2.5} dot={false} name="acumulado" />
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="flex items-center gap-4 mt-2">
                                  <div className="flex items-center gap-1.5"><span className="w-5 h-0.5 inline-block rounded" style={{ background: sCol.line }} /><span className="text-[10px] font-bold text-slate-400 uppercase">Acumulado</span></div>
                                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block opacity-50" style={{ background: sCol.bar2 }} /><span className="text-[10px] font-bold text-slate-400 uppercase">Diário</span></div>
                                </div>
                              </div>
                            );
                          }

                          // ─ PRIVADO 2: Distribuição Semanal ─
                          if (selectedSectorDetail === "privado 2") {
                            // Agrupa por semana do mês (1–4)
                            const weeklyMap: Record<string, number> = {
                              "Semana 1": 0, "Semana 2": 0, "Semana 3": 0, "Semana 4": 0,
                            };
                            normalizedEntries
                              .filter(e => e.date.startsWith(selectedMonth) && sectorAssessorIds.has(e.estagiarioId))
                              .forEach(e => {
                                const day = parseInt(e.date.split("-")[2], 10);
                                const week = day <= 7 ? "Semana 1" : day <= 14 ? "Semana 2" : day <= 21 ? "Semana 3" : "Semana 4";
                                weeklyMap[week] += e.count;
                              });

                            const weeklyData = Object.entries(weeklyMap).map(([week, total]) => ({ week, total }));
                            const bestWeek = weeklyData.reduce((best, x) => x.total > best.total ? x : best, weeklyData[0]);

                            return (
                              <div className="bg-white border border-teal-100 rounded-xl shadow-sm p-5 ring-1 ring-teal-200/40">
                                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <CalendarDays className="w-4 h-4 text-teal-500" />
                                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                      Distribuição Semanal de Produção
                                    </h4>
                                  </div>
                                  {bestWeek && bestWeek.total > 0 && (
                                    <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5">
                                      <span className="text-[10px] text-teal-500 font-extrabold uppercase tracking-wider">Melhor Semana:</span>
                                      <span className="text-sm font-black text-teal-700">{bestWeek.week} · {bestWeek.total.toLocaleString("pt-BR")} proc.</span>
                                    </div>
                                  )}
                                </div>
                                <div className="h-[200px] w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={weeklyData} margin={{ top: 6, right: 16, left: -20, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#475569", fontWeight: 700 }} axisLine={false} tickLine={false} />
                                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                                      <Tooltip
                                        contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                                        formatter={(val: number) => [val.toLocaleString("pt-BR"), "Processos"]}
                                      />
                                      <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={60}>
                                        {weeklyData.map((entry, idx) => (
                                          <Cell
                                            key={idx}
                                            fill={entry.week === bestWeek?.week ? sCol.line : sCol.bar}
                                            opacity={entry.week === bestWeek?.week ? 1 : 0.65}
                                          />
                                        ))}
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                                <p className="text-[10px] text-slate-400 font-semibold mt-2 uppercase tracking-wider">
                                  Semana 1 = dias 1–7 · Semana 2 = dias 8–14 · Semana 3 = dias 15–21 · Semana 4 = dias 22+
                                </p>
                              </div>
                            );
                          }

                          // ─ PRIVADO 3: Tendência com Média Móvel de 3 dias ─
                          if (selectedSectorDetail === "privado 3") {
                            const dailyMap3 = new Map<string, number>();
                            for (let i = 1; i <= daysInMonthS; i++) {
                              const d = `${ys}-${String(monthS).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
                              dailyMap3.set(d, 0);
                            }
                            normalizedEntries
                              .filter(e => e.date.startsWith(selectedMonth) && sectorAssessorIds.has(e.estagiarioId))
                              .forEach(e => { dailyMap3.set(e.date, (dailyMap3.get(e.date) || 0) + e.count); });

                            const dailyArr = Array.from(dailyMap3.entries()).map(([date, count]) => ({ date, count }));
                            const movingAvgData = dailyArr.map((item, i) => {
                              const window = dailyArr.slice(Math.max(0, i - 2), i + 1);
                              const avg = Math.round(window.reduce((s, x) => s + x.count, 0) / window.length);
                              return {
                                dia: String(parseInt(item.date.split("-")[2], 10)).padStart(2, "0"),
                                diario: item.count,
                                media3d: avg,
                              };
                            });

                            // Tendência geral (diferença entre última média e primeira)
                            const firstAvg = movingAvgData[0]?.media3d || 0;
                            const lastAvg = movingAvgData[movingAvgData.length - 1]?.media3d || 0;
                            const trendDiff = lastAvg - firstAvg;

                            return (
                              <div className="bg-white border border-emerald-100 rounded-xl shadow-sm p-5 ring-1 ring-emerald-200/40">
                                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-emerald-500" />
                                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                      Tendência de Produtividade (Média Móvel 3 Dias)
                                    </h4>
                                  </div>
                                  <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border ${trendDiff >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                                    <span className={`text-[10px] font-extrabold uppercase tracking-wider ${trendDiff >= 0 ? "text-emerald-500" : "text-red-400"}`}>Tendência do Mês:</span>
                                    <span className={`text-sm font-black ${trendDiff >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                      {trendDiff >= 0 ? "▲" : "▼"} {Math.abs(trendDiff)} proc.
                                    </span>
                                  </div>
                                </div>
                                <div className="h-[220px] w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={movingAvgData} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                      <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
                                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                                      <Tooltip
                                        contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                                        formatter={(val: number, name: string) => [val.toLocaleString("pt-BR"), name === "media3d" ? "Média Móvel (3d)" : "Diário"]}
                                        labelFormatter={(l) => `Dia ${l}`}
                                      />
                                      <Bar dataKey="diario" fill={sCol.bar2} radius={[3, 3, 0, 0]} maxBarSize={20} opacity={0.4} name="diario" />
                                      <Line
                                        type="monotone"
                                        dataKey="media3d"
                                        stroke={sCol.line}
                                        strokeWidth={2.5}
                                        dot={{ r: 3, fill: sCol.line, strokeWidth: 0 }}
                                        name="media3d"
                                      />
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="flex items-center gap-4 mt-2">
                                  <div className="flex items-center gap-1.5"><span className="w-5 h-0.5 inline-block rounded" style={{ background: sCol.line }} /><span className="text-[10px] font-bold text-slate-400 uppercase">Média Móvel 3 Dias</span></div>
                                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block opacity-40" style={{ background: sCol.bar2 }} /><span className="text-[10px] font-bold text-slate-400 uppercase">Produção Diária</span></div>
                                </div>
                              </div>
                            );
                          }

                          // ─ CRIME: Breakdown CV vs. CR por Assessor ─
                          if (selectedSectorDetail === "crime") {
                            // Agrupa contagem de CV* vs CR* por assessor
                            const cvCrData = assessorsInSector.map(a => {
                              let cv = 0, cr = 0, outros = 0;
                              normalizedEntries
                                .filter(e => e.date.startsWith(selectedMonth) && e.estagiarioId === a.id)
                                .forEach(e => {
                                  if (e.typeBreakdown) {
                                    Object.entries(e.typeBreakdown).forEach(([t, q]) => {
                                      const key = t.toUpperCase();
                                      const n = Number(q);
                                      if (key.includes("CV")) cv += n;
                                      else if (key.includes("CR")) cr += n;
                                      else outros += n;
                                    });
                                  } else {
                                    // se não tiver breakdown, conta no total
                                    outros += e.count;
                                  }
                                });
                              return {
                                name: a.name.split(" ")[0],
                                fullName: a.name,
                                cv,
                                cr,
                                outros,
                                total: cv + cr + outros,
                              };
                            }).filter(a => a.total > 0).sort((a, b) => b.total - a.total);

                            const hasBreakdown = cvCrData.some(x => x.cv > 0 || x.cr > 0);

                            return (
                              <div className="bg-white border border-violet-100 rounded-xl shadow-sm p-5 ring-1 ring-violet-200/40">
                                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-violet-500" />
                                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                      Breakdown Cível (CV) vs. Criminal (CR) por Assessor
                                    </h4>
                                  </div>
                                  {cvCrData.length > 0 && (
                                    <div className="flex items-center gap-3">
                                      <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
                                        <span className="text-[10px] text-blue-500 font-extrabold uppercase">CV Total:</span>
                                        <span className="text-xs font-black text-blue-700">{cvCrData.reduce((s, x) => s + x.cv, 0).toLocaleString("pt-BR")}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1">
                                        <span className="text-[10px] text-violet-500 font-extrabold uppercase">CR Total:</span>
                                        <span className="text-xs font-black text-violet-700">{cvCrData.reduce((s, x) => s + x.cr, 0).toLocaleString("pt-BR")}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {!hasBreakdown || cvCrData.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-400">
                                    <FileText className="w-8 h-8 opacity-30" />
                                    <span className="text-sm font-medium">Dados de tipo de processo não disponíveis para este mês.</span>
                                    <span className="text-xs text-slate-300">O breakdown CV/CR é populado durante a sincronização com a planilha.</span>
                                  </div>
                                ) : (
                                  <div className="h-[220px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={cvCrData} layout="vertical" margin={{ top: 0, right: 40, left: 4, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                                        <YAxis
                                          type="category"
                                          dataKey="name"
                                          width={76}
                                          tick={{ fontSize: 10, fill: "#475569", fontWeight: 700 }}
                                          axisLine={false}
                                          tickLine={false}
                                        />
                                        <Tooltip
                                          contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                                          formatter={(val: number, name: string, props: any) => [
                                            `${val.toLocaleString("pt-BR")} proc.`,
                                            name === "cv" ? "Cível (CV)" : name === "cr" ? "Criminal (CR)" : "Outros",
                                          ]}
                                          labelFormatter={(l) => cvCrData.find(x => x.name === l)?.fullName || l}
                                        />
                                        <Legend
                                          wrapperStyle={{ fontSize: 10, fontWeight: 700, paddingTop: 8 }}
                                          formatter={(val) => val === "cv" ? "Cível (CV)" : val === "cr" ? "Criminal (CR)" : "Outros"}
                                        />
                                        <Bar dataKey="cv" stackId="a" fill="#2563eb" radius={[0, 0, 0, 0]} maxBarSize={18} name="cv" />
                                        <Bar dataKey="cr" stackId="a" fill="#7c3aed" maxBarSize={18} name="cr" />
                                        {cvCrData.some(x => x.outros > 0) && (
                                          <Bar dataKey="outros" stackId="a" fill="#94a3b8" radius={[0, 4, 4, 0]} maxBarSize={18} name="outros" />
                                        )}
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return null; // Fallback para setores sem gráfico exclusivo
                        })()}

                        {/* Listagem dos Assessores do Setor */}
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                              Produtividade Individual dos Assessores
                            </h4>
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                              Clique no card para ver detalhes/redistribuir
                            </span>
                          </div>

                          {assessorsInSector.length === 0 ? (
                            <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-xl text-slate-400 font-medium">
                              Nenhum assessor cadastrado neste setor.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {assessorsInSector.map((assessor) => {
                                const percentMeta = assessor.dailyGoal > 0 
                                  ? Math.min(100, Math.round(((assessor.totalAnalyzed / 4) / (assessor.dailyGoal * 5)) * 100)) 
                                  : 0;
                                const weeklyAvg = Math.round((assessor.totalAnalyzed || 0) / 4);

                                return (
                                  <div
                                    key={assessor.id}
                                    onClick={() => {
                                      setSelectedEstagiarioDetail(assessor.id);
                                      setRedistributeDate(selectedDetailDate || getCurrentDate());
                                    }}
                                    className="bg-white border border-slate-200 hover:border-indigo-400 transition-all rounded-xl p-5 shadow-sm hover:shadow-md cursor-pointer flex flex-col relative group"
                                  >


                                    <div className="flex items-center gap-3 mb-4">
                                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm uppercase">
                                        {assessor.name.charAt(0)}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <h4 className="text-sm font-extrabold text-slate-800 truncate group-hover:text-indigo-600 transition-colors pr-6">
                                          {assessor.name}
                                        </h4>
                                        <p className="text-[10px] text-slate-400 font-semibold uppercase">
                                          Meta: {assessor.dailyGoal || 25} proc/dia
                                        </p>
                                      </div>
                                    </div>

                                    <div className="space-y-4 flex-1">
                                      {/* Métricas Principais */}
                                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                        <div>
                                          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Total no Mês</span>
                                          <span className="text-sm font-black text-slate-800 font-mono mt-0.5 block">{assessor.totalAnalyzed.toLocaleString("pt-BR")} proc.</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Média Semanal</span>
                                          <span className="text-sm font-black text-slate-800 font-mono mt-0.5 block">~{weeklyAvg} proc.</span>
                                        </div>
                                      </div>

                                      {/* Progresso de Meta */}
                                      <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">
                                          <span>Progresso Mensal</span>
                                          <span>{percentMeta}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                          <div 
                                            className={`h-full rounded-full transition-all ${percentMeta >= 100 ? 'bg-emerald-500' : percentMeta >= 50 ? 'bg-indigo-500' : 'bg-amber-500'}`} 
                                            style={{ width: `${percentMeta}%` }}
                                          ></div>
                                        </div>
                                      </div>

                                      {/* Produtividade do Dia Selecionado */}
                                      <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-xs">
                                        <span className="text-slate-500 font-medium">Analisado em {selectedDetailDate.split("-").reverse().join("/")}:</span>
                                        <span className="font-bold text-slate-900 font-mono">{assessor.detailAnalyzed} / {assessor.dailyGoal} proc.</span>
                                      </div>


                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </motion.div>
              ) : activeTab === "dashboard" ? (
                <motion.div
                  key="dashboard-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col gap-6"
                >
                  {/* Charts Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Daily Productivity Bar/Line Chart */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 lg:col-span-2">
                      <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2 mb-4">
                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                        PRODUTIVIDADE DIÁRIA (
                        {selectedMonth.split("-").reverse().join("/")})
                      </h2>
                      <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={dailyTrendsData}
                            style={{ cursor: "pointer" }}
                            onClick={(state) => {
                              if (state && state.activeTooltipIndex !== undefined && dailyTrendsData[state.activeTooltipIndex]) {
                                  const clickedData = dailyTrendsData[state.activeTooltipIndex];
                                  const formattedClickedDate = `${selectedMonth}-${clickedData.dia}`;
                                  setSelectedDetailDate(formattedClickedDate);
                              }
                            }}
                            margin={{
                              top: 10,
                              right: 10,
                              left: -20,
                              bottom: 0,
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="#e2e8f0"
                            />
                            <XAxis
                              dataKey="dia"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 10, fill: "#64748b" }}
                              dy={10}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 10, fill: "#64748b" }}
                            />
                            <Tooltip
                              cursor={{ fill: "#f1f5f9" }}
                              contentStyle={{
                                borderRadius: "8px",
                                border: "none",
                                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                              }}
                              labelStyle={{
                                fontWeight: "bold",
                                color: "#0f172a",
                              }}
                            />
                            <Bar
                              dataKey="total"
                              fill="#818cf8"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={40}
                            />
                            <Line
                              type="monotone"
                              dataKey="total"
                              stroke="#4338ca"
                              strokeWidth={2}
                              dot={{ r: 3, fill: "#4338ca", strokeWidth: 0 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Produtividade por Setor Pie Chart */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col justify-between">
                      <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2 mb-4">
                        <Grid className="w-4 h-4 text-indigo-500" />
                        PRODUTIVIDADE POR SETOR
                      </h2>
                      <div className="h-[200px] w-full relative flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={distributionChartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={70}
                              paddingAngle={4}
                              dataKey="value"
                              stroke="none"
                            >
                              {distributionChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                fontSize: "11px",
                                borderRadius: "10px",
                                border: "1px solid #e2e8f0",
                              }}
                              formatter={(val: number) => [`${val.toLocaleString("pt-BR")} proc.`]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Centered Total */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-2xl font-light text-slate-800">
                            {distributionChartData.reduce((s, e) => s + e.value, 0).toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wider">
                            Processos
                          </span>
                        </div>
                      </div>
                      {/* Legend below */}
                      <div className="flex flex-wrap gap-2 justify-center mt-2 border-t border-slate-50 pt-2">
                        {(() => {
                          const distTotal = distributionChartData.reduce((s, e) => s + e.value, 0);
                          return distributionChartData.map((entry, index) => {
                            const pct = distTotal > 0 ? Math.round((entry.value / distTotal) * 100) : 0;
                            return (
                              <div key={index} className="flex items-center gap-1">
                                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.fill }}></div>
                                <span className="text-[9px] font-semibold text-slate-600 uppercase">
                                  {entry.name}: {pct}%
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {/* Participação por Setor (Barras horizontais) */}
                      {(() => {
                        const total = distributionChartData.reduce((s, e) => s + e.value, 0);
                        if (total === 0) return null;
                        
                        const barColors: Record<string, string> = {
                          "PÚBLICO": "bg-blue-600",
                          "PRIVADO 1": "bg-sky-400",
                          "PRIVADO 2": "bg-teal-400",
                          "PRIVADO 3": "bg-emerald-500",
                          "CRIME": "bg-purple-500"
                        };

                        return (
                          <div className="mt-3 pt-3 border-t border-slate-100 w-full text-left">
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                              Participação por Setor
                            </h3>
                            <div className="space-y-2">
                              {distributionChartData.map((entry) => {
                                const pct = Math.round((entry.value / total) * 100);
                                return (
                                  <div key={entry.name} className="w-full">
                                    <div className="flex justify-between text-[10px] mb-0.5">
                                      <span className="font-semibold text-slate-700 capitalize">
                                        {entry.name.toLowerCase()}
                                      </span>
                                      <span className="font-mono font-bold text-slate-900">
                                        {entry.value.toLocaleString("pt-BR")} ({pct}%)
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${barColors[entry.name] || "bg-indigo-500"}`}
                                        style={{ width: `${pct}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Tabela de Feitos por Dia e Média */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col">
                    <div className="mb-4">
                      <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-indigo-500" />
                        FEITOS POR DIA E MÉDIA
                      </h2>
                      <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">
                        Lista diária de processos concluídos e média por assessor ativo
                      </p>
                    </div>
                    
                    <div className="max-h-[250px] overflow-y-auto border border-slate-100 rounded-lg pr-1">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-[9px] text-slate-400 font-extrabold tracking-wider uppercase sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2">Dia</th>
                            <th className="px-3 py-2 text-center">Processos Feitos</th>
                            <th className="px-3 py-2 text-right">Média / Assessor</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs divide-y divide-slate-100 font-mono">
                          {dailyTeamDoneData.map((item) => (
                            <tr 
                              key={item.dateStr} 
                              onClick={() => setSelectedDetailDate(item.dateStr)}
                              className={`cursor-pointer transition-colors ${
                                selectedDetailDate === item.dateStr
                                  ? "bg-indigo-50/70 hover:bg-indigo-50"
                                  : item.isWeekend 
                                    ? "bg-slate-50/[0.4] hover:bg-slate-100/[0.5] text-slate-400" 
                                    : "hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <td className="px-3 py-2 font-bold">
                                {item.dia}/{selectedMonth.split("-")[1]} <span className="text-[10px] font-normal text-slate-450 ml-1">({item.dayOfWeekLabel})</span>
                              </td>
                              <td className="px-3 py-2 text-center font-bold">
                                <span className={item.total > 0 ? "text-slate-800" : "text-slate-350"}>
                                  {item.total}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-indigo-650">
                                {item.media > 0 ? `${item.media} proc.` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>



                </motion.div>
              ) : (
                /* Aba Desempenho da Equipe */
                <motion.div
                  key="desempenho-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col gap-6"
                >
                  {/* Performance Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Left Column (Team Performance List) */}
                    <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                          <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
                            <Award className="w-4 h-4 text-amber-500" />
                            DESEMPENHO DA EQUIPE —{" "}
                            {selectedMonth.split("-").reverse().join("/")}
                          </h2>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Classificação dinâmica baseada em processos concluídos
                          </p>
                        </div>
                      </div>

                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-bold tracking-widest uppercase cursor-pointer select-none">
                            <tr>
                              <th className="px-6 py-3.5 group" onClick={() => handleTeamSort("name")}>
                                <div className="flex items-center gap-1">Assessor {renderSortIcon("name")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("sector")}>
                                <div className="flex items-center justify-center gap-1">Setor / Meta {renderSortIcon("sector")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("todayAnalyzed")}>
                                <div className="flex items-center justify-center gap-1">Feito Hoje {renderSortIcon("todayAnalyzed")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("totalAnalyzed")}>
                                <div className="flex items-center justify-center gap-1">Acumulado Mês {renderSortIcon("totalAnalyzed")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("daysWorked")}>
                                <div className="flex items-center justify-center gap-1">Dias Ativos {renderSortIcon("daysWorked")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center font-mono group" onClick={() => handleTeamSort("averagePerDay")}>
                                <div className="flex items-center justify-center gap-1">Média/Dia {renderSortIcon("averagePerDay")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("goalProgressRatio")}>
                                <div className="flex items-center justify-center gap-1">Aproveitamento {renderSortIcon("goalProgressRatio")}</div>
                              </th>
                              <th className="px-6 py-3.5 text-right group" onClick={() => handleTeamSort("status")}>
                                <div className="flex items-center justify-end gap-1">Status {renderSortIcon("status")}</div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="text-sm divide-y divide-slate-100">
                            {filteredEstagiariosData.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-6 py-10 text-center text-slate-400 font-medium">
                                  Nenhum assessor encontrado com os filtros atuais.
                                </td>
                              </tr>
                            ) : (
                              filteredEstagiariosData.map((item, idx) => {
                                return (
                                  <tr
                                    key={item.id}
                                    onClick={() => setSelectedEstagiarioDetail(item.id)}
                                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                                  >
                                    <td className="px-6 py-4 font-semibold text-slate-800 flex items-center gap-2.5">
                                      <div className="w-6 h-6 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-xs font-bold font-mono">
                                        {idx + 1}
                                      </div>
                                      {item.name}
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                      <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-600 border border-slate-150 capitalize">
                                        Setor {item.sector}
                                      </span>
                                      <span className="block text-[9px] text-slate-400 font-bold font-mono mt-1">{item.dailyGoal}/dia</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                      <span className="font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md text-xs border border-indigo-100">{item.todayAnalyzed}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center text-slate-800 font-bold">{item.totalAnalyzed}</td>
                                    <td className="px-4 py-4 text-center text-slate-500">{item.daysWorked} dias</td>
                                    <td className="px-4 py-4 text-center font-mono text-slate-600">
                                      {item.averagePerDay > 0 ? item.averagePerDay : "—"}
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full transition-all ${
                                            item.goalProgressRatio >= 100 ? "bg-emerald-500" :
                                            item.goalProgressRatio >= 70 ? "bg-amber-400" : "bg-red-500"
                                          }`} style={{ width: `${Math.min(item.goalProgressRatio, 100)}%` }}></div>
                                        </div>
                                        <span className="font-mono text-[10px] text-slate-600 font-bold">{item.goalProgressRatio}%</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                                        item.status === "ALTO"
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : item.status === "NORMAL"
                                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                                            : "bg-red-950 text-red-200 border border-red-800"
                                      }`}>
                                        {item.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sidebar Info Panels */}
                    <div className="flex flex-col gap-6">
                      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm relative overflow-hidden flex-1 flex flex-col justify-between">
                        <div className="relative z-10">
                          <h3 className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-4">Distribuição por Setor</h3>
                          <div className="space-y-4">
                            {categorySplit.map((cat) => (
                              <div key={cat.name}>
                                <div className="flex justify-between text-[10px] mb-1.5 font-semibold text-slate-300">
                                  <span>{cat.name}</span>
                                  <span>{cat.pct}%</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${cat.color}`} style={{ width: `${cat.pct}%` }}></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="absolute -bottom-8 -right-8 w-32 h-32 border-4 border-white/5 rounded-full z-0"></div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                        <h3 className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-3 flex items-center gap-1.5">
                          <HelpCircle className="w-4 h-4 text-slate-400" />
                          Prazo e Suporte
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed mb-4">
                          Selecione um assessor na tabela para visualizar o histórico diário detalhado, editar lançamentos retroativos ou redistribuir processos.
                        </p>
                        <button
                          onClick={() => alert("Tabela de produtividade baseada nos dados do arquivo de referência da 1ª Vice-Presidência.")}
                          className="w-full py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 text-[10px] font-bold rounded transition-all cursor-pointer"
                        >
                          AJUDA E REGULAMENTO
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>

              )}
            </AnimatePresence>
          </main>

        {/* Footer */}
        <footer className="mt-auto px-6 py-4 bg-white border-t border-slate-200 text-[10px] text-slate-400 font-semibold tracking-wide flex flex-col md:flex-row justify-between items-center gap-2">
          <p>
            © 2026 SISTEMA DE GESTÃO DE PRODUTIVIDADE - 1ª VICE-PRESIDÊNCIA
            (Estagiarioia de Recursos)
          </p>
          <p>VERSÃO 1.1.2 • FIREBASE PERSISTENTE</p>
        </footer>

        {/* MODAL: NOVO REGISTRO / LANÇAMENTO */}
        <AnimatePresence>
          {isLaunchModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsLaunchModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              ></motion.div>

              {/* Content Card */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden relative z-10"
              >
                <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    {formEditingId
                      ? "Editar Lançamento"
                      : "Novo Lançamento Diário"}
                  </h3>
                  <button
                    onClick={() => setIsLaunchModalOpen(false)}
                    className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveEntry} className="p-6 space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                      Assessor Responsável
                    </label>
                    <select
                      id="select-assessor"
                      value={formEstagiarioId}
                      onChange={(e) => setFormEstagiarioId(e.target.value)}
                      required
                      disabled={!!formEditingId}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-slate-400 focus:bg-white"
                    >
                      <option value="" disabled>
                        Selecione um assessor...
                      </option>
                      {estagiarios.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                        Data de Referência
                      </label>
                      <input
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        required
                        disabled={!!formEditingId}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                        Processos Analisados
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formCount === 0 ? "" : formCount}
                        onChange={(e) =>
                          setFormCount(Math.max(0, Number(e.target.value)))
                        }
                        required
                        placeholder="Qtd."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-slate-400 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsLaunchModalOpen(false)}
                      className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-500 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex-1 py-2 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      {isSaving ? "Salvando..." : "Confirmar Lançamento"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>





        {/* DRAWER/MODAL: DETALHES DO ESTAGIARIO */}
        <AnimatePresence>
          {selectedEstagiarioDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-end">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedEstagiarioDetail(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              ></motion.div>

              {/* Sidebar content card */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col z-10"
              >
                {/* Header inside detailing drawer */}
                {(() => {
                  const detailedEstagiario = parsedEstagiariosData.find(
                    (a) => a.id === selectedEstagiarioDetail,
                  );
                  if (!detailedEstagiario) return null;

                  return (
                    <>
                      {isEditingCadastre ? (
                        <form
                          onSubmit={handleUpdateEstagiarioCadastre}
                          className="p-6 bg-slate-150 border-b border-slate-250 space-y-3"
                        >
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                            Editar Cadastro do Assessor
                          </h4>

                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                              Nome Completo
                            </label>
                            <input
                              type="text"
                              required
                              value={editEstagiarioName}
                              onChange={(e) =>
                                setEditEstagiarioName(e.target.value)
                              }
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 text-slate-800 font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                              Número de Matrícula
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: 123456"
                              value={editEstagiarioMatricula}
                              onChange={(e) =>
                                setEditEstagiarioMatricula(e.target.value)
                              }
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 text-slate-800 font-medium font-mono"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                                Setor do Assessor
                              </label>
                              <select
                                value={editEstagiarioRole}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditEstagiarioRole(val);
                                  setEditEstagiarioDailyGoal(25);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-slate-250 rounded-lg text-xs outline-none focus:border-slate-400 cursor-pointer font-bold text-slate-700"
                              >
                                <option value="público">Público</option>
                                <option value="privado 1">Privado 1</option>
                                <option value="privado 2">Privado 2</option>
                                <option value="privado 3">Privado 3</option>
                                <option value="crime">Crime</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                                Meta Diária
                              </label>
                              <input
                                type="number"
                                min="1"
                                required
                                value={editEstagiarioDailyGoal}
                                onChange={(e) =>
                                  setEditEstagiarioDailyGoal(
                                    Math.max(1, Number(e.target.value) || 1),
                                  )
                                }
                                className="w-full px-2 py-1.5 bg-white border border-slate-250 rounded-lg text-xs font-mono outline-none focus:border-slate-400 text-slate-800"
                              />
                            </div>
                          </div>



                          <div className="flex gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setIsEditingCadastre(false)}
                              className="flex-1 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={isSaving}
                              className="flex-1 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-805 disabled:opacity-50 cursor-pointer"
                            >
                              {isSaving ? "Salvando..." : "Salvar"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-bold">
                                {detailedEstagiario.name}
                              </h4>
                              <button
                                onClick={() => {
                                  setEditEstagiarioName(
                                    detailedEstagiario.name,
                                  );
                                  setEditEstagiarioRole(
                                    detailedEstagiario.sector || "público",
                                  );
                                  setEditEstagiarioDailyGoal(
                                    detailedEstagiario.dailyGoal ?? 25,
                                  );
                                  setEditEstagiarioMatricula(
                                    detailedEstagiario.matricula || "",
                                  );
                                  setIsEditingCadastre(true);
                                }}
                                className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                                title="Editar cadastro do assessor"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteEstagiario(detailedEstagiario.id)}
                                className="p-1 text-slate-400 hover:text-red-400 transition-colors cursor-pointer ml-1"
                                title="Excluir assessor da equipe"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px] capitalize">
                                Setor {detailedEstagiario.sector}
                              </span>
                              {detailedEstagiario.matricula && (
                                <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-200 border border-emerald-800 rounded text-[9px] font-mono">
                                  Matrícula: {detailedEstagiario.matricula}
                                </span>
                              )}

                              <span>
                                • Meta Diária: {detailedEstagiario.dailyGoal}
                              </span>
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono mt-1">
                              Consolidação Individual • {selectedMonth}
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedEstagiarioDetail(null)}
                            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      )}

                      {/* Stats strip inside detail panel */}
                      <div className="grid grid-cols-4 divide-x divide-slate-100 bg-slate-50 border-b border-slate-200">
                        <div className="p-3 text-center">
                          <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">
                            Total Mês
                          </span>
                          <span className="text-base font-bold text-slate-800">
                            {detailedEstagiario.totalAnalyzed}
                          </span>
                        </div>
                        <div className="p-3 text-center">
                          <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">
                            Dias Ativos
                          </span>
                          <span className="text-base font-bold text-slate-800">
                            {detailedEstagiario.daysWorked}
                          </span>
                        </div>
                        <div className="p-3 text-center">
                          <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">
                            Média Diária
                          </span>
                          <span className="text-base font-bold text-slate-800">
                            {detailedEstagiario.averagePerDay}
                          </span>
                        </div>
                        <div className="p-3 text-center">
                          <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">
                            Meta Batida
                          </span>
                          <span
                            className="text-base font-bold text-emerald-600 font-mono"
                            title={`${detailedEstagiario.daysMeetingGoal} dias atingindo a meta diária de ${detailedEstagiario.dailyGoal}`}
                          >
                            {detailedEstagiario.daysMeetingGoal} d
                          </span>
                        </div>
                      </div>

                      {/* Tabs selector */}
                      <div className="px-6 pt-4">
                        <div className="flex border border-slate-200 mb-2 bg-slate-50 p-1 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setDetailTab("month")}
                            className={`flex-grow text-center py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                              detailTab === "month"
                                ? "bg-white text-slate-800 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Resumo Mensal
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailTab("day")}
                            className={`flex-grow text-center py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                              detailTab === "day"
                                ? "bg-white text-slate-800 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Processos do Dia ({selectedDetailDate.split("-").reverse().join("/")})
                          </button>
                        </div>
                      </div>

                      {/* Detailed List of individual records */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-4 pt-2">
                        {detailTab === "month" ? (
                          <>
                            <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                              Histórico de Lançamentos
                            </h5>

                            {detailedEstagiario.entriesList.length === 0 ? (
                              <div className="p-8 text-center text-slate-400">
                                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                Nenhum lançamento cadastrado para este período.
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden shadow-sm">
                                {detailedEstagiario.entriesList.map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="p-3 bg-white hover:bg-slate-50 flex justify-between items-center transition-colors"
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <CalendarDays className="w-4 h-4 text-slate-400" />
                                      <div>
                                        <span className="block text-xs font-bold text-slate-700">
                                          {entry.date
                                            .split("-")
                                            .reverse()
                                            .join("/")}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          Ano de Referência:{" "}
                                          {entry.date.split("-")[0]}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                                        {entry.count} concluídos
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => {
                                            setFormEstagiarioId(entry.estagiarioId);
                                            setFormDate(entry.date);
                                            setFormCount(entry.count);
                                            setFormEditingId(entry.id);
                                            setIsLaunchModalOpen(true);
                                          }}
                                          className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleDeleteEntry(entry.id)
                                          }
                                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                              Linha do Tempo dos Processos
                            </h5>

                            {loadingProcesses ? (
                              <div className="p-8 text-center text-slate-400 font-bold text-xs animate-pulse">
                                Carregando processos do banco...
                              </div>
                            ) : (() => {
                              const dayProcs = Object.entries(detailedProcesses as Record<string, any>)
                                .filter(([_, info]) => info.date === selectedDetailDate)
                                .map(([numProcesso, info]) => ({
                                  numeroProcesso: numProcesso,
                                  ...info,
                                }))
                                .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

                              if (dayProcs.length === 0) {
                                return (
                                  <div className="p-8 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                                    <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                    Nenhum processo individual registrado para esta data no sistema.
                                    <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                                      As abas individuais contam processos sincronizados a partir da planilha.
                                    </p>
                                  </div>
                                );
                              }

                              const formatDuration = (ms: number): string => {
                                const totalSecs = Math.floor(ms / 1000);
                                if (totalSecs < 60) return `${totalSecs}s`;
                                const mins = Math.floor(totalSecs / 60);
                                const secs = totalSecs % 60;
                                if (mins < 60) return `${mins}m ${secs}s`;
                                const hours = Math.floor(mins / 60);
                                const remMins = mins % 60;
                                return `${hours}h ${remMins}m`;
                              };

                              return (
                                <div className="relative pl-6 border-l border-slate-200 space-y-6 py-2 ml-3">
                                  {dayProcs.map((proc, index) => {
                                    const timeStr = new Date(proc.timestamp).toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    });

                                    // Calcular intervalo para o anterior
                                    let intervalStr = "";
                                    if (index > 0) {
                                      const prevProc = dayProcs[index - 1];
                                      const diff = new Date(proc.timestamp).getTime() - new Date(prevProc.timestamp).getTime();
                                      if (diff > 1000) {
                                        intervalStr = formatDuration(diff);
                                      } else {
                                        intervalStr = "Registrado em lote";
                                      }
                                    }

                                    return (
                                      <div key={proc.numeroProcesso} className="relative">
                                        {/* Marcador na linha do tempo */}
                                        <div className="absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full bg-slate-900 border-4 border-white flex items-center justify-center shadow-xs">
                                          <span className="text-[6px] text-white font-extrabold">{index + 1}</span>
                                        </div>

                                        {/* Intervalo acima do card */}
                                        {intervalStr && (
                                          <div className="absolute -top-[16px] left-2 text-[9px] text-slate-400 font-bold bg-slate-50/80 px-2 py-0.5 rounded border border-slate-100 shadow-3xs flex items-center gap-1 font-mono">
                                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                                            {intervalStr === "Registrado em lote" ? intervalStr : `Tempo decorrido: +${intervalStr}`}
                                          </div>
                                        )}

                                        {/* Card do processo */}
                                        <div className="bg-white border border-slate-200/80 p-3 rounded-lg hover:shadow-xs hover:border-slate-300 transition-all">
                                          <div className="flex justify-between items-start">
                                            <span className="font-mono text-xs text-slate-800 font-bold break-all">
                                              {proc.numeroProcesso}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-dashed border-slate-100">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                              Finalizado
                                            </span>
                                            <span className="text-[10px] font-extrabold text-slate-700 font-mono">
                                              {timeStr}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </>
                        )}

                        {/* Seção de Redistribuição de Processos */}
                        <div className="mt-4 border-t border-slate-100 pt-4">
                          {!isRedistributeOpen ? (
                            <button
                              onClick={() => { setIsRedistributeOpen(true); setRedistributeFromId(""); setRedistributeCount(0); }}
                              className="w-full py-2.5 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                            >
                              <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                              REDISTRIBUIR PROCESSOS PARA {detailedEstagiario.name.toUpperCase()}
                            </button>
                          ) : (
                            <form onSubmit={handleRedistribute} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between mb-1">
                                <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                                  <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                                  Redistribuir para {detailedEstagiario.name}
                                </h5>
                                <button type="button" onClick={() => setIsRedistributeOpen(false)} className="text-amber-400 hover:text-amber-800 cursor-pointer">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div>
                                <label className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider mb-1">Tirar processos de:</label>
                                <select required value={redistributeFromId} onChange={(e) => setRedistributeFromId(e.target.value)} className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-amber-400 cursor-pointer">
                                  <option value="">— Selecione o estagiário —</option>
                                  {estagiarios.filter((e) => e.id !== selectedEstagiarioDetail).map((e) => (
                                    <option key={e.id} value={e.id}>{e.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider mb-1">Data</label>
                                  <input type="date" required value={redistributeDate} onChange={(e) => setRedistributeDate(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono outline-none focus:border-amber-400 text-slate-800" />
                                </div>
                                <div>
                                  <label className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider mb-1">Qtd. Processos</label>
                                  <input type="number" required min={1} value={redistributeCount || ""} onChange={(e) => setRedistributeCount(Math.max(0, Number(e.target.value)))} placeholder="Ex: 5" className="w-full px-2 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono outline-none focus:border-amber-400 text-slate-800" />
                                </div>
                              </div>
                              {redistributeFromId && redistributeCount > 0 && (
                                <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-[10px] text-amber-800">
                                  <span className="font-bold">Resumo:</span> Transferir <span className="font-black text-amber-900">{redistributeCount}</span> processo(s) de <span className="font-black">{estagiarios.find(e => e.id === redistributeFromId)?.name}</span> para <span className="font-black">{detailedEstagiario.name}</span> em <span className="font-mono font-bold">{redistributeDate.split("-").reverse().join("/")}</span>
                                </div>
                              )}
                              <button type="submit" disabled={isSaving || !redistributeFromId || redistributeCount <= 0} className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                                {isSaving ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                {isSaving ? "REDISTRIBUINDO..." : "CONFIRMAR REDISTRIBUIÇÃO"}
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MODAL: INTEGRAÇÃO COM PLANILHA GOOGLE & COPIAR/COLAR */}
        <AnimatePresence>
          {isSheetsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSheetsModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              ></motion.div>

              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
              >
                <div className="bg-emerald-800 text-white px-6 py-4 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Sincronização com Planilha Google / Excel
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsSheetsModalOpen(false)}
                    className="text-emerald-200 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                  {/* Google Auth Integration Section */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5">
                    <h4 className="text-xs font-bold text-slate-850 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></span>
                      Segurança de Dados: Acesso Privado ao Google Drive
                    </h4>
                    <p className="text-xs text-slate-600 mb-3.5 leading-relaxed">
                      Você pode conectar sua conta Google{" "}
                      <strong>com sua permissão</strong> para acessar planilhas
                      privadas diretamente do seu Google Drive, sem precisar
                      expô-las de forma pública ("Qualquer pessoa com o link
                      pode ler").
                    </p>

                    {googleUser ? (
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <div className="flex items-center gap-2.5">
                          {googleUser.photoURL ? (
                            <img
                              src={googleUser.photoURL}
                              alt={googleUser.displayName || "Google User"}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full border border-emerald-300"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs animate-fade-in">
                              {googleUser.displayName?.charAt(0) || "U"}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-emerald-950">
                              Conectado: {googleUser.displayName}
                            </p>
                            <p className="text-[10px] text-emerald-700 font-mono">
                              {googleUser.email}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={handleGoogleLogout}
                          className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 border border-red-200 rounded-md text-[11px] font-bold transition-all cursor-pointer"
                        >
                          Sair do Google
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200 rounded-lg p-3">
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-800">
                            Conecte sua conta do Google
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 animate-pulse">
                            Permite leitura direta do seu Drive sem precisar
                            deixar a planilha pública.
                          </p>
                        </div>
                        <button
                          onClick={handleGoogleLogin}
                          disabled={isLoggingInGoogle}
                          className="gsi-material-button text-xs py-1.5 px-3 self-start sm:self-center border border-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer font-bold rounded-lg bg-white"
                          style={{ height: "36px" }}
                        >
                          <svg
                            version="1.1"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 48 48"
                            style={{
                              display: "block",
                              width: "16px",
                              height: "16px",
                            }}
                          >
                            <path
                              fill="#EA4335"
                              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                            ></path>
                            <path
                              fill="#4285F4"
                              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                            ></path>
                            <path
                              fill="#FBBC05"
                              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                            ></path>
                            <path
                              fill="#34A853"
                              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                            ></path>
                          </svg>
                          <span>
                            {isLoggingInGoogle
                              ? "Conectando..."
                              : "Entrar com o Google"}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Connection Section */}
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4.5 space-y-4">
                    {lastSyncTime && spreadsheetUrl && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Planilha Vinculada no Banco de Dados
                        </div>
                        <p className="text-slate-600 font-mono text-[10px] truncate">
                          {spreadsheetUrl}
                        </p>
                        <p className="text-[10px] text-emerald-700">
                          Última sincronização efetuada em:{" "}
                          <strong>
                            {new Date(lastSyncTime).toLocaleString("pt-BR")}
                          </strong>
                        </p>
                      </div>
                    )}

                    {sheetSyncError && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-900 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-rose-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                          Atenção na Sincronização
                        </div>
                        <p className="text-slate-700 text-[11px] leading-relaxed">
                          {sheetSyncError}
                        </p>
                        {!googleUser && (
                          <p className="text-[10px] text-rose-800 font-bold mt-1">
                            👉 Dica: Se a sua planilha é privada, clique no
                            botão{" "}
                            <strong>
                              "Segurança de Dados: Acesso Privado"
                            </strong>{" "}
                            acima para conectar sua conta Google e autorizar o
                            acesso.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex justify-center pt-1">
                      <button
                        onClick={() =>
                          triggerSheetsSync(spreadsheetUrl, estagiarios)
                        }
                        disabled={syncingSheets}
                        className="bg-emerald-700 text-white hover:bg-emerald-800 px-6 py-3 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 font-sans shadow-md w-full justify-center"
                      >
                        {syncingSheets ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            <span>Sincronizando ({syncDuration.toFixed(1)}s)...</span>
                          </>
                        ) : (
                          "Sincronizar Planilha Agora"
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setIsSheetsModalOpen(false);
                      setPreviewEntries([]);
                      setPreviewEstagiariosToCreate([]);
                      setPreviewEstagiariosDetailed([]);
                      setPasteDataText("");
                    }}
                    className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-150 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Fechar Painel
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Toast Notification */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed bottom-6 right-6 z-[100] max-w-md w-full bg-white rounded-xl shadow-2xl border border-slate-200 p-4 flex gap-3 items-start animate-fade-in"
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  toast.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : toast.type === "error"
                      ? "bg-rose-50 text-rose-800 border border-rose-200"
                      : "bg-blue-50 text-blue-800 border border-blue-200"
                }`}
              >
                {toast.type === "success" ? (
                  <span className="text-base font-bold">✓</span>
                ) : toast.type === "error" ? (
                  <span className="text-base font-bold">⚠️</span>
                ) : (
                  <span className="text-base font-bold">ℹ️</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-805 text-slate-800 uppercase tracking-wide">
                  {toast.type === "success"
                    ? "Sucesso"
                    : toast.type === "error"
                      ? "Atenção"
                      : "Mensagem do Sistema"}
                </p>
                <p className="text-xs text-slate-650 text-slate-600 mt-1 leading-relaxed font-sans font-medium whitespace-pre-line">
                  {toast.message}
                </p>
              </div>

              <button
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 -mt-1 cursor-pointer text-sm font-bold"
              >
                &times;
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Real-time Notifications */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
          <AnimatePresence>
            {notifications.map((notif) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 50, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="bg-white p-5 rounded-2xl shadow-[0_20px_50px_rgba(99,102,241,0.18)] border-l-6 border-indigo-500 flex items-start gap-4 w-[420px] pointer-events-auto relative overflow-hidden"
              >
                {/* Efeito decorativo sutil */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full blur-2xl -mr-6 -mt-6 -z-10 opacity-60" />

                {/* Ícone Destacado */}
                <div className="h-12 w-12 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm">
                  <Zap className="w-6 h-6 text-indigo-600 fill-indigo-100 animate-pulse" />
                </div>

                <div className="flex-1 pr-4">
                  <p className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1">
                    ⚡ Novo Processo!
                  </p>
                  <p className="text-base font-bold text-slate-800 leading-tight">
                    <span className="text-indigo-600 font-extrabold text-lg block mb-0.5">
                      {notif.estagiarioName}
                    </span>
                    <span className="text-slate-600 text-sm font-semibold">
                      finalizou mais um processo!
                    </span>
                  </p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-xs text-slate-600 font-semibold">
                      Total de hoje:{" "}
                      <span className="font-extrabold text-slate-900 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full text-xs">
                        {notif.count} {notif.count === 1 ? "processo" : "processos"}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Botão de Fechar Individual */}
                <button
                  onClick={() => {
                    setNotifications((prevArr) => prevArr.filter((n) => n.id !== notif.id));
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer absolute top-3 right-3 text-lg font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100"
                >
                  &times;
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
