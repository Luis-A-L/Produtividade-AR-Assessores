import { createClient } from '@supabase/supabase-js'

const getSupabaseCredentials = () => {
    const envUrl = import.meta.env.VITE_SUPABASE_URL
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (envUrl && envKey && !envUrl.includes('placeholder') && !envKey.includes('placeholder')) {
          return { url: envUrl, key: envKey, fromEnv: true }
    }

    const localUrl = localStorage.getItem('VITE_SUPABASE_URL')
    const localKey = localStorage.getItem('VITE_SUPABASE_ANON_KEY')

    if (localUrl && localKey) {
          return { url: localUrl, key: localKey, fromEnv: false }
    }

    return {
        url: "https://lqmjfjusljxduxwkoqhc.supabase.co",
        key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxbWpmanVzbGp4ZHV4d2tvcWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMTQyNjQsImV4cCI6MjA5ODU5MDI2NH0.EjdUNiNDuDUWebMVOJmnqF2plkDtvrJo-2yJLx_heZk",
        fromEnv: false
    }
}

const credentials = getSupabaseCredentials()

export const isSupabaseConfigured = credentials !== null

export const supabase = isSupabaseConfigured
  ? createClient(credentials!.url, credentials!.key)
  : ({
      from: () => {
        const chain = <T = any>(data: T[] = [], error: any = null) => {
          const result = { data, error }
          const thenable = Promise.resolve(result)
          return {
            eq: () => chain(data, error),
            neq: () => chain(data, error),
            gt: () => chain(data, error),
            gte: () => chain(data, error),
            lt: () => chain(data, error),
            lte: () => chain(data, error),
            like: () => chain(data, error),
            ilike: () => chain(data, error),
            is: () => chain(data, error),
            in: () => chain(data, error),
            contains: () => chain(data, error),
            range: () => chain(data, error),
            maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error }),
            single: () => Promise.resolve({ data: data[0] ?? null, error }),
            then: thenable.then.bind(thenable),
            catch: thenable.catch.bind(thenable),
            finally: thenable.finally.bind(thenable),
          }
        }
        return {
          select: () => chain<any[]>([]),
          insert: (vals: any) => Promise.resolve({ data: vals ?? null, error: null }),
          upsert: (vals: any) => Promise.resolve({ data: vals ?? null, error: null }),
          update: () => chain<any>(null),
          delete: () => chain<any>(null),
        }
      },
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOAuth: () => Promise.resolve({ data: null, error: null }),
        signOut: () => Promise.resolve({ error: null }),
      },
      channel: () => ({
        on: function() { return this },
        subscribe: () => {},
      }),
      removeChannel: () => {},
    } as any)

// ==========================================
// Google OAuth Login (com escopo Sheets)
// ==========================================
export const signInWithGoogle = async (): Promise<{ user: any; accessToken: string } | null> => {
    if (!isSupabaseConfigured) {
          throw new Error('Supabase nao configurado. Por favor, configure as credenciais.')
    }
    const redirectUrl = window.location.origin + import.meta.env.BASE_URL

    const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
                  scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
                  redirectTo: redirectUrl,
                  skipBrowserRedirect: true,
                  queryParams: {
                            access_type: 'offline',
                            prompt: 'consent',
                  },
          },
    })
    if (error || !data?.url) {
          console.error('Erro ao obter URL de autenticação com Google:', error)
          throw error || new Error('Não foi possível obter a URL de autenticação.')
    }

    // Abre janela pop-up centralizada
    const width = 520
    const height = 650
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2))
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2))

    const popup = window.open(
        data.url,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,location=no`
    )

    if (!popup) {
        throw new Error('A janela pop-up foi bloqueada pelo navegador. Permita pop-ups para fazer login.')
    }

    return new Promise((resolve, reject) => {
        let isResolved = false

        const cleanup = () => {
            isResolved = true
            window.removeEventListener('message', onMessage)
            if (authSubscription) {
                authSubscription.unsubscribe()
            }
            if (checkClosedInterval) {
                clearInterval(checkClosedInterval)
            }
        }

        const handleAuthSuccess = async (providerToken?: string | null) => {
            if (isResolved) return
            cleanup()

            if (providerToken) {
                localStorage.setItem('google_provider_token', providerToken)
            }

            const { data: sessionData } = await supabase.auth.getSession()
            const session = sessionData?.session
            const token = providerToken || session?.provider_token || localStorage.getItem('google_provider_token') || ''
            resolve({
                user: session?.user ?? null,
                accessToken: token,
            })
        }

        const onMessage = async (event: MessageEvent) => {
            const isAllowedOrigin =
                event.origin === window.location.origin ||
                event.origin.includes('localhost') ||
                event.origin.includes('127.0.0.1') ||
                event.origin.includes('github.io')
            if (!isAllowedOrigin) return
            if (event.data?.type === 'SUPABASE_OAUTH_CALLBACK') {
                const hash = event.data.hash || ''
                const search = event.data.search || ''

                try {
                    let providerToken: string | null = null

                    if (hash) {
                        const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash)
                        const accessToken = hashParams.get('access_token')
                        const refreshToken = hashParams.get('refresh_token')
                        providerToken = hashParams.get('provider_token')

                        if (accessToken && refreshToken) {
                            await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken,
                            })
                        }
                    } else if (search) {
                        const searchParams = new URLSearchParams(search.startsWith('?') ? search.substring(1) : search)
                        const code = searchParams.get('code')
                        if (code) {
                            const { data: exchangeData } = await supabase.auth.exchangeCodeForSession(code)
                            providerToken = exchangeData.session?.provider_token ?? null
                        }
                    }

                    await handleAuthSuccess(providerToken)
                } catch (err) {
                    console.error('Erro ao processar callback de OAuth no pop-up:', err)
                    if (!isResolved) {
                        cleanup()
                        reject(err)
                    }
                }
            }
        }

        window.addEventListener('message', onMessage)

        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                const token = session.provider_token || localStorage.getItem('google_provider_token')
                await handleAuthSuccess(token)
            }
        })

        const checkClosedInterval = setInterval(() => {
            if (popup.closed) {
                setTimeout(async () => {
                    if (isResolved) return
                    const { data: sessionData } = await supabase.auth.getSession()
                    if (sessionData?.session?.user) {
                        await handleAuthSuccess(sessionData.session.provider_token)
                    } else {
                        cleanup()
                        resolve(null)
                    }
                }, 500)
            }
        }, 600)
    })
}

export const signOut = async () => {
    if (!isSupabaseConfigured) return
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Erro ao sair:', error)
}

// Retorna o access token do Google para usar na API do Sheets
export const getGoogleAccessToken = async (): Promise<string | null> => {
    if (!isSupabaseConfigured) return null
    const { data } = await supabase.auth.getSession()
    return (data.session?.provider_token) ?? localStorage.getItem('google_provider_token') ?? null
}

// Retorna a sessao atual do Supabase
export const getSession = async () => {
    if (!isSupabaseConfigured) return null
    const { data } = await supabase.auth.getSession()
    return data.session
}

const fetchSheetsWithTimeout = async (url: string, options: any = {}, timeoutMs = 25000) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timer)
        return response
    } catch (error: any) {
        clearTimeout(timer)
        if (error.name === "AbortError") {
            throw new Error(`Tempo limite excedido (${timeoutMs}ms) ao acessar: ${url}`)
        }
        throw error
    }
}

const getSpreadsheetIdFromUrl = (url: string): string | null => {
    if (url.includes("/d/e/")) {
        const match = url.match(/\/d\/e\/([a-zA-Z0-9-_]+)/)
        if (match) return match[1]
    }
    if (url.includes("/file/d/")) {
        const match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/)
        if (match) return match[1]
    }
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
    return match ? match[1] : null
}

const rowsToCsv = (rows: any[][]): string => {
    return rows.map(row =>
        row.map((cell: any) => {
            const val = String(cell ?? "")
            if (val.includes(",") || val.includes("\n") || val.includes('"') || val.includes(";")) {
                return `"${val.replace(/"/g, '""')}"`
            }
            return val
        }).join(",")
    ).join("\n")
}

export interface SheetFetchResult {
    sheets: Record<string, string>
    csvText: string
    targetSheetTitle?: string
}

export const fetchSheetDataDirectly = async (url: string, token: string): Promise<SheetFetchResult> => {
    const spreadsheetId = getSpreadsheetIdFromUrl(url)
    if (!spreadsheetId) {
        throw new Error("Formato do link do Google Planilhas inválido.")
    }

    const metaRes = await fetchSheetsWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        { headers: { Authorization: `Bearer ${token}` } },
        15000
    )

    if (!metaRes.ok) {
        const errBody = await metaRes.json().catch(() => ({}))
        const errMsg = errBody?.error?.message || `Erro HTTP ${metaRes.status}`
        if (metaRes.status === 401) throw Object.assign(new Error("Sua sessão expirou."), { status: 401, action: "LOGOUT" })
        if (metaRes.status === 403) throw Object.assign(new Error(errMsg), { status: 403 })
        if (metaRes.status === 429) throw Object.assign(new Error("Limite de requisições excedido."), { status: 429 })
        throw new Error(errMsg)
    }

    const metaData = await metaRes.json()
    const sheetsList = metaData.sheets || []

    if (sheetsList.length === 0) {
        throw new Error("A planilha não contém abas.")
    }

    // Extrai o gid da URL (ex: gid=1415874718) para localizar a aba de setembro
    const gidMatch = url.match(/gid=([0-9]+)/)
    const targetGid = gidMatch ? parseInt(gidMatch[1], 10) : null
    const matchingSheet = targetGid !== null
        ? sheetsList.find((s: any) => s.properties?.sheetId === targetGid)
        : null
    const targetSheetTitle = matchingSheet?.properties?.title

    const sheetsResultMap: Record<string, string> = {}

    const rangesQuery = sheetsList
        .map((sheet: any) => `ranges=${encodeURIComponent("'" + sheet.properties.title + "'!A1:ZZ2500")}`)
        .join("&")

    const batchRes = await fetchSheetsWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesQuery}`,
        { headers: { Authorization: `Bearer ${token}` } },
        45000
    )

    if (!batchRes.ok) {
        const errBody = await batchRes.json().catch(() => ({}))
        const errMsg = errBody?.error?.message || `Erro HTTP ${batchRes.status}`
        throw new Error(errMsg)
    }

    const batchData = await batchRes.json()
    const valueRanges = batchData.valueRanges || []

    valueRanges.forEach((rangeData: any, idx: number) => {
        const title = sheetsList[idx]?.properties?.title || `Aba${idx}`
        const rows = rangeData.values || []
        sheetsResultMap[title] = rowsToCsv(rows)
    })

    const primaryTitle = targetSheetTitle || sheetsList[0]?.properties?.title || "Geral"
    return {
        sheets: sheetsResultMap,
        csvText: sheetsResultMap[primaryTitle] || "",
        targetSheetTitle: targetSheetTitle || undefined,
    }
}
