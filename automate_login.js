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

const APP_URL = 'http://localhost:3005';
const TARGET_ACCOUNT_EMAIL = 'controleassessoria'; // e-mail ou prefixo da conta de controle

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAutomation() {
  console.log('🚀 Iniciando robô de automação de login...');
  
  // Inicializa o navegador Chromium com flags anti-detecção de bots
  const browser = await puppeteer.launch({
    headless: false, // Necessário false para interagir com a tela de login visual
    defaultViewport: null,
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
    await delay(3000);

    // 1. Verifica se há banner de "Sincronização com Planilha Pausada"
    const hasWarningBanner = await page.evaluate(() => {
      const texts = ['sincronização com planilha pausada', 'reconectar google'];
      const content = document.body.innerText.toLowerCase();
      return texts.every(t => content.includes(t));
    });

    if (hasWarningBanner) {
      console.log('⚠️ Banner de sincronização pausada detectado. Clicando em "Reconectar Google"...');
      
      // Localiza o botão "Reconectar Google"
      const buttons = await page.$$('button');
      let loginButton = null;
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText, btn);
        if (text.toLowerCase().includes('reconectar google') || text.toLowerCase().includes('entrar com o google')) {
          loginButton = btn;
          break;
        }
      }

      if (loginButton) {
        // Clica no botão e aguarda a abertura do pop-up / redirecionamento do Google
        await Promise.all([
          loginButton.click(),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);
        console.log('👉 Botão de login clicado.');
        await delay(5000);
      } else {
        console.log('❌ Botão de reconexão não pôde ser encontrado.');
        await browser.close();
        return;
      }
    } else {
      console.log('✅ A planilha já parece estar sincronizada ou o banner não está visível.');
    }

    // 2. Interagindo com a janela/aba de login do Google
    // O Google abre uma página de login. Capturamos a aba correspondente caso tenha aberto em nova guia
    let loginPage = page;
    const allPages = await browser.pages();
    for (const p of allPages) {
      const url = p.url();
      if (url.includes('accounts.google.com')) {
        loginPage = p;
        console.log('🔍 Encontrada aba de autenticação do Google.');
        break;
      }
    }

    // Aguarda carregar a lista de contas ou campos
    await loginPage.bringToFront();
    await delay(2000);

    // 3. Selecionar a conta controleassessoria
    console.log(`👤 Procurando pela conta "${TARGET_ACCOUNT_EMAIL}" na lista...`);
    const emailSelector = `[data-email*="${TARGET_ACCOUNT_EMAIL}"]`;
    const hasEmailElement = await loginPage.$(emailSelector);

    if (hasEmailElement) {
      console.log('👉 Conta encontrada. Clicando...');
      await Promise.all([
        hasEmailElement.click(),
        loginPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
      ]);
      await delay(4000);
    } else {
      console.log('⚠️ Conta específica não encontrada na listagem visual do Google.');
      console.log('💡 Dica: Faça login manual uma vez nesse navegador automatizado para salvar a conta na lista.');
    }

    // 4. Passar pela tela de aviso de segurança ("Este app não foi verificado" / nukddxkiffzghnppsjwi.supabase.co)
    const isUnverifiedAppScreen = await loginPage.evaluate(() => {
      return document.body.innerText.includes('Este app não foi verificado') || 
             document.body.innerText.includes('Advanced') || 
             document.body.innerText.includes('Avançado');
    });

    if (isUnverifiedAppScreen) {
      console.log('🔒 Tela de aplicativo não verificado detectada. Contornando...');
      
      // Clica em "Avançado" (Advanced)
      const advancedBtn = await loginPage.$('#advancedButton');
      if (advancedBtn) {
        await advancedBtn.click();
        await delay(1500);
        console.log('👉 Clicou em "Avançado".');

        // Clica no link "Acessar nukddxkiffzghnppsjwi.supabase.co (não seguro)"
        const unsafeLink = await loginPage.$('#personal-link');
        if (unsafeLink) {
          await Promise.all([
            unsafeLink.click(),
            loginPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
          ]);
          console.log('👉 Clicou em "Acessar (não seguro)".');
          await delay(3000);
        }
      }
    }

    // 5. Tela de Consentimento de Escopos (Google OAuth Consent Screen - botão "Continuar")
    const isConsentScreen = await loginPage.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('continuar') || text.includes('continue') || text.includes('permitir') || text.includes('allow');
    });

    if (isConsentScreen) {
      console.log('📋 Tela de consentimento de acesso do Google detectada. Clicando em "Continuar"...');
      
      // Busca o botão "Continuar" por seletores comuns ou texto do elemento
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

    // Retorna para a página principal para verificar se a sincronização concluiu
    await page.bringToFront();
    await delay(3000);
    console.log('🏁 Processo de automação finalizado.');

  } catch (err) {
    console.error('❌ Ocorreu um erro durante a automação:', err.message || err);
  } finally {
    // Mantém o navegador aberto por mais 5 segundos antes de encerrar
    await delay(5000);
    await browser.close();
    console.log('🚪 Navegador fechado.');
  }
}

runAutomation();
