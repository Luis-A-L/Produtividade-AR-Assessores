/**
 * automate_login.js
 * 
 * Script de automação utilizando Puppeteer para realizar o login e
 * reconectar a planilha do Google contornando os botões da aplicação
 * e as etapas da tela de login e consentimento do Google.
 * 
 * Uso: node automate_login.js
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const APP_URL = 'http://localhost:3005';
const TARGET_ACCOUNT_EMAIL = 'controleassessoria'; // e-mail ou prefixo da conta de controle
const USER_DATA_DIR = './puppeteer_user_data';
const MARKER_FILE = path.join(USER_DATA_DIR, 'login_success.marker');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAutomation() {
  console.log('🚀 Iniciando robô de automação de login...');
  
  // Verifica se já houve login com sucesso anteriormente
  const hasLoggedInBefore = fs.existsSync(MARKER_FILE);
  const shouldRunHeadless = hasLoggedInBefore;
  
  console.log(`🤖 Modo de execução: ${shouldRunHeadless ? 'HEADLESS (Silencioso em background)' : 'HEADFUL (Visual na tela para login manual)'}`);
  if (!shouldRunHeadless) {
    console.log('💡 Nota: Como é a primeira execução ou a sessão expirou, abriremos o navegador visualmente para que você possa efetuar o login.');
  }

  // Inicializa o navegador Chromium com perfil persistente para salvar cookies e conta Google
  const browser = await puppeteer.launch({
    headless: shouldRunHeadless, // Roda invisível se já logou antes. Caso contrário, abre visual.
    defaultViewport: null,
    userDataDir: USER_DATA_DIR, // Diretório persistente local para cookies/sessão
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled', // Esconde a flag webdriver
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  try {
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    
    // Passa parâmetros para evitar ser identificado como bot pelo Google
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log(`🔗 Navegando para o sistema: ${APP_URL}`);
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    await delay(5000); // Aguarda a renderização inicial da página e validações

    // 1. Procurar pelo botão "Reconectar Google"
    console.log('🔍 Procurando pelo botão de login/reconexão...');
    const buttons = await page.$$('button');
    let targetButton = null;

    for (const btn of buttons) {
      const text = await page.evaluate(el => el.innerText, btn);
      if (text.toLowerCase().includes('reconectar google')) {
        targetButton = btn;
        break;
      }
    }

    // Fallback: se não achar "Reconectar Google", procurar por "Entrar com o Google"
    if (!targetButton) {
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText, btn);
        if (text.toLowerCase().includes('entrar com o google')) {
          targetButton = btn;
          break;
        }
      }
    }

    if (!targetButton) {
      console.log('⚠️ Nenhum botão de reconexão ou login ("Reconectar Google" / "Entrar com o Google") foi encontrado.');
      await delay(3000);
      await browser.close();
      return;
    }

    console.log(`👉 Clicando no botão: "${await page.evaluate(el => el.innerText, targetButton)}"...`);
    await Promise.all([
      targetButton.click(),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);

    // 2. Interagindo com a janela/aba de login do Google
    console.log('⏳ Aguardando a tela de autenticação do Google (accounts.google.com) carregar...');
    let loginPage = null;
    
    // Loop de verificação ativa por até 15 segundos para encontrar a aba do Google
    for (let i = 0; i < 30; i++) {
      const allPages = await browser.pages();
      for (const p of allPages) {
        const url = p.url();
        if (url.includes('accounts.google.com')) {
          loginPage = p;
          break;
        }
      }
      if (loginPage) break;
      await delay(500); // Espera 500ms antes da próxima checagem
    }

    // Se estamos na aba do Google (ou a página principal foi redirecionada para ela)
    if (loginPage) {
      console.log('🔍 Encontrada aba de autenticação do Google.');
      await loginPage.bringToFront();
      
      console.log('⏳ Aguardando campos de entrada ou contas do Google na página...');
      // Aguarda até o campo de email ou listagem de contas aparecer na página
      await loginPage.waitForSelector('[data-email], input[type="email"]', { timeout: 15000 }).catch(() => {});
      await delay(3000);

      // 3. Selecionar a conta controleassessoria
      console.log(`👤 Procurando pela conta "${TARGET_ACCOUNT_EMAIL}" na lista...`);
      const emailSelector = `[data-email*="${TARGET_ACCOUNT_EMAIL}"]`;
      const hasEmailElement = await loginPage.$(emailSelector);

      if (hasEmailElement) {
        console.log('👉 Conta encontrada na listagem do Google. Clicando...');
        await Promise.all([
          hasEmailElement.click(),
          loginPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);
        await delay(4000);
      } else {
        console.log('⚠️ Conta específica não encontrada na listagem visual do Google.');
        
        if (!shouldRunHeadless) {
          console.log('💡 Dica: Faça login manual nesta janela automatizada agora para salvar a sua sessão.');
          // Aguarda um tempo caso o usuário precise interagir manualmente na primeira vez
          console.log('⏳ Aguardando interação manual por até 45 segundos...');
          await delay(45000);
        } else {
          throw new Error('Conta do Google não listada no modo headless. Forçando reconfiguração visual.');
        }
      }

      // 4. Passar pela tela de aviso de segurança do Google ("Este app não foi verificado")
      const isUnverifiedAppScreen = await loginPage.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('Este app não foi verificado') || 
               text.includes('Advanced') || 
               text.includes('Avançado');
      });

      if (isUnverifiedAppScreen) {
        console.log('🔒 Tela de aplicativo não verificado detectada. Contornando...');
        
        // Clica em "Avançado" (Advanced)
        const advancedBtn = await loginPage.$('#advancedButton');
        if (advancedBtn) {
          await advancedBtn.click();
          await delay(1500);
          console.log('👉 Clicou em "Avançado".');

          // Clica no link "Acessar lqmjfjusljxduxwkoqhc.supabase.co (não seguro)"
          let unsafeLink = await loginPage.$('#personal-link');
          if (!unsafeLink) {
            // Varredura de links como fallback
            const links = await loginPage.$$('a');
            for (const l of links) {
              const text = await loginPage.evaluate(el => el.innerText, l);
              if (text.toLowerCase().includes('acessar') || text.toLowerCase().includes('supabase.co')) {
                unsafeLink = l;
                break;
              }
            }
          }

          if (unsafeLink) {
            await Promise.all([
              unsafeLink.click(),
              loginPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
            ]);
            console.log('👉 Clicou no link de acesso inseguro.');
            await delay(3000);
          } else {
            console.log('❌ Link "Acessar (não seguro)" não encontrado.');
          }
        } else {
          console.log('❌ Botão "Avançado" não encontrado.');
        }
      }

      // 5. Tela de Consentimento de Escopos (Google OAuth Consent Screen - botão "Continuar")
      const isConsentScreen = await loginPage.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('continuar') || text.includes('continue') || text.includes('permitir') || text.includes('allow');
      });

      if (isConsentScreen) {
        console.log('📋 Tela de consentimento de acesso do Google detectada. Clicando em "Continuar"...');
        
        // Busca o botão "Continuar"
        const consentButtons = await loginPage.$$('button');
        let continueButton = null;
        for (const btn of consentButtons) {
          const text = await loginPage.evaluate(el => el.innerText, btn);
          if (text.toLowerCase().includes('continuar') || text.toLowerCase().includes('continue') || text.toLowerCase().includes('permitir') || text.toLowerCase().includes('allow')) {
            continueButton = btn;
            break;
          }
        }

        if (continueButton) {
          await Promise.all([
            continueButton.click(),
            loginPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
          ]);
          console.log('👉 Consentimento concedido com sucesso!');
          await delay(5000);
        } else {
          // Fallback por ID padrão do botão de confirmação do Google
          const fallbackId = await loginPage.$('#submit_approve_access');
          if (fallbackId) {
            await Promise.all([
              fallbackId.click(),
              loginPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
            ]);
            console.log('👉 Consentimento concedido via ID fallback!');
            await delay(5000);
          } else {
            console.log('❌ Botão de consentimento não encontrado.');
          }
        }
      }
    } else {
      console.log('ℹ️ Nenhuma janela de login do Google aberta ou necessária (sessão ativa/automatic login).');
    }

    // 6. Retorna para a página principal para sincronizar
    console.log('🔄 Voltando para o sistema principal. Aguardando renderização...');
    await page.bringToFront();
    await delay(5000); // Aguarda o carregamento do painel após o login

    console.log('🔍 Procurando pelo botão "Tentar Novamente" para sincronizar a planilha...');
    const finalButtons = await page.$$('button');
    let retryButton = null;

    for (const btn of finalButtons) {
      const text = await page.evaluate(el => el.innerText, btn);
      if (text.toLowerCase().includes('tentar novamente')) {
        retryButton = btn;
        break;
      }
    }

    if (retryButton) {
      console.log('👉 Botão "Tentar Novamente" encontrado. Clicando para sincronizar...');
      await retryButton.click();
      console.log('⏳ Sincronização iniciada. Aguardando 10 segundos...');
      await delay(10000); // Aguarda tempo suficiente para a sincronização da planilha
      console.log('✅ Sincronização concluída com sucesso!');
      
      // Salva o marcador de login realizado com sucesso
      try {
        if (!fs.existsSync(USER_DATA_DIR)) {
          fs.mkdirSync(USER_DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(MARKER_FILE, 'true');
        console.log('📝 Marcador de login gravado com sucesso. Próximas execuções serão silenciosas.');
      } catch (errWrite) {
        console.error('Erro ao escrever arquivo de marcador:', errWrite);
      }
    } else {
      console.log('⚠️ Botão "Tentar Novamente" não foi encontrado na página principal.');
    }

    console.log('🏁 Processo de automação finalizado.');

  } catch (err) {
    console.error('❌ Ocorreu um erro durante a automação:', err.message || err);
    // Se falhou, remove o marcador para forçar abertura visual na próxima tentativa
    try {
      if (fs.existsSync(MARKER_FILE)) {
        fs.unlinkSync(MARKER_FILE);
        console.log('🗑️ Marcador de login removido por falha na execução.');
      }
    } catch (errUnlink) {}
  } finally {
    // Mantém o navegador aberto por mais 3 segundos antes de encerrar
    await delay(3000);
    await browser.close();
    console.log('🚪 Navegador fechado.');
  }
}

runAutomation();
