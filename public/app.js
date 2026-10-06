// Estado da aplicação
let currentTab = 'whatsapp';
let statusPollInterval = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();
  fetchStatus();
  fetchSettings();
  fetchServices();
  fetchAppointments();

  // Polling de status a cada 3 segundos
  statusPollInterval = setInterval(fetchStatus, 3000);
});

// Navegação de Abas
function setTab(tabId) {
  currentTab = tabId;

  // Atualiza botões
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
    btn.classList.add('text-slate-400', 'border-transparent');
  });

  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
    activeBtn.classList.remove('text-slate-400', 'border-transparent');
  }

  // Atualiza seções
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });

  const activeContent = document.getElementById(`tab-${tabId}`);
  if (activeContent) {
    activeContent.classList.remove('hidden');
  }

  if (tabId === 'appointments') fetchAppointments();
  if (tabId === 'services') fetchServices();
  if (window.lucide) window.lucide.createIcons();
}

// Buscar Status Geral & WhatsApp
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    // Atualiza cabeçalho
    if (data.secretaryName) document.getElementById('headerSecretaryName').innerText = data.secretaryName;
    if (data.companyName) document.getElementById('headerCompanyName').innerText = data.companyName;
    if (data.secretaryName) document.getElementById('simHeaderName').innerText = `${data.secretaryName} (Secretária Virtual)`;

    // Badge Gemini
    const badgeGemini = document.getElementById('badgeGemini');
    if (data.hasGeminiApiKey) {
      badgeGemini.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span class="text-emerald-300">Gemini: Ativo</span>';
    } else {
      badgeGemini.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span><span class="text-amber-300">Gemini: Sem Chave</span>';
    }

    // Badge e Painel WhatsApp
    const badgeWA = document.getElementById('badgeWhatsApp');
    const qrLoading = document.getElementById('qrLoading');
    const qrImage = document.getElementById('qrImage');
    const qrSuccess = document.getElementById('qrSuccess');
    const connectedPhoneText = document.getElementById('connectedPhoneText');

    const wa = data.whatsapp || {};

    if (wa.state === 'connected') {
      badgeWA.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span class="text-emerald-300">WhatsApp: Conectado</span>';
      qrLoading.classList.add('hidden');
      qrImage.classList.add('hidden');
      qrSuccess.classList.remove('hidden');
      connectedPhoneText.innerText = `Número: +${wa.phoneNumber || 'Ativo'}`;
    } else if (wa.state === 'qr_ready' && wa.qrCodeDataUrl) {
      badgeWA.innerHTML = '<span class="w-2 h-2 rounded-full bg-sky-400"></span><span class="text-sky-300">WhatsApp: Escanear QR</span>';
      qrLoading.classList.add('hidden');
      qrSuccess.classList.add('hidden');
      qrImage.src = wa.qrCodeDataUrl;
      qrImage.classList.remove('hidden');
    } else {
      badgeWA.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span><span class="text-slate-400">WhatsApp: Desconectado</span>';
      qrImage.classList.add('hidden');
      qrSuccess.classList.add('hidden');
      qrLoading.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Erro ao buscar status:', err);
  }
}

// Ações do WhatsApp
async function reconnectWhatsApp() {
  try {
    const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Tentando reconectar...');
    fetchStatus();
  } catch (e) {
    alert('Erro ao tentar reconectar.');
  }
}

async function disconnectWhatsApp() {
  if (!confirm('Deseja realmente desconectar a sessão do WhatsApp?')) return;
  try {
    await fetch('/api/whatsapp/disconnect', { method: 'POST' });
    alert('WhatsApp desconectado.');
    fetchStatus();
  } catch (e) {
    alert('Erro ao desconectar.');
  }
}

// Configurações
async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    document.getElementById('inputSecretaryName').value = data.secretaryName || '';
    document.getElementById('inputCompanyName').value = data.companyName || '';
    document.getElementById('inputCompanyDescription').value = data.companyDescription || '';
    document.getElementById('inputWorkingHours').value = data.workingHours || '';
    document.getElementById('inputAddress').value = data.address || '';
    document.getElementById('inputAdminPhone').value = data.adminPhone || '';
  } catch (err) {
    console.error('Erro ao buscar settings:', err);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const geminiApiKey = document.getElementById('inputGeminiApiKey').value;
  const body = {
    secretaryName: document.getElementById('inputSecretaryName').value,
    companyName: document.getElementById('inputCompanyName').value,
    companyDescription: document.getElementById('inputCompanyDescription').value,
    workingHours: document.getElementById('inputWorkingHours').value,
    address: document.getElementById('inputAddress').value,
    adminPhone: document.getElementById('inputAdminPhone').value,
  };
  if (geminiApiKey) {
    body.geminiApiKey = geminiApiKey;
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      alert('Configurações salvas com sucesso!');
      document.getElementById('inputGeminiApiKey').value = '';
      fetchStatus();
      fetchSettings();
    }
  } catch (err) {
    alert('Erro ao salvar configurações.');
  }
}

// Serviços
async function fetchServices() {
  try {
    const res = await fetch('/api/services');
    const services = await res.json();
    const grid = document.getElementById('servicesListGrid');
    grid.innerHTML = '';

    if (services.length === 0) {
      grid.innerHTML = '<p class="text-sm text-slate-500 col-span-3">Nenhum serviço cadastrado.</p>';
      return;
    }

    services.forEach(s => {
      const card = document.createElement('div');
      card.className = 'bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between';
      card.innerHTML = `
        <div>
          <div class="flex justify-between items-start mb-2">
            <h4 class="font-bold text-base text-slate-100">${s.name}</h4>
            <span class="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-semibold">R$ ${s.price.toFixed(2)}</span>
          </div>
          <p class="text-xs text-slate-400 mb-4">${s.description || 'Sem descrição.'}</p>
        </div>
        <div class="flex justify-between items-center pt-3 border-t border-slate-800 text-xs text-slate-500">
          <span>⏱️ ${s.durationMinutes} minutos</span>
          <button onclick="deleteService('${s.id}')" class="text-rose-400 hover:text-rose-300 font-medium">Excluir</button>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error('Erro ao buscar serviços:', err);
  }
}

function openNewServiceModal() {
  document.getElementById('modalService').classList.remove('hidden');
}

function closeServiceModal() {
  document.getElementById('modalService').classList.add('hidden');
}

async function handleSaveService(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById('serviceName').value,
    description: document.getElementById('serviceDesc').value,
    price: parseFloat(document.getElementById('servicePrice').value),
    durationMinutes: parseInt(document.getElementById('serviceDuration').value)
  };

  try {
    const res = await fetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      closeServiceModal();
      fetchServices();
    }
  } catch (err) {
    alert('Erro ao salvar serviço.');
  }
}

async function deleteService(id) {
  if (!confirm('Deseja remover este serviço?')) return;
  try {
    await fetch(`/api/services/${id}`, { method: 'DELETE' });
    fetchServices();
  } catch (e) {
    alert('Erro ao excluir serviço.');
  }
}

// Agendamentos
async function fetchAppointments() {
  try {
    const res = await fetch('/api/appointments');
    const appointments = await res.json();
    const tbody = document.getElementById('appointmentsTableBody');
    tbody.innerHTML = '';

    if (appointments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-500">Nenhum agendamento registrado até o momento.</td></tr>';
      return;
    }

    appointments.forEach(app => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-900/60 transition';

      let statusBadge = '';
      if (app.status === 'confirmed') {
        statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 font-medium">Confirmado</span>';
      } else if (app.status === 'cancelled') {
        statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-rose-500/20 text-rose-400 font-medium">Cancelado</span>';
      } else {
        statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-sky-500/20 text-sky-400 font-medium">Concluído</span>';
      }

      tr.innerHTML = `
        <td class="p-3 font-mono text-xs text-slate-400 font-semibold">${app.id}</td>
        <td class="p-3 font-semibold text-slate-200">${app.clientName}</td>
        <td class="p-3 text-slate-400 text-xs">${app.clientPhone}</td>
        <td class="p-3 text-slate-300 font-medium">${app.date} às ${app.time}</td>
        <td class="p-3 text-slate-300 text-xs">${app.service}</td>
        <td class="p-3">${statusBadge}</td>
        <td class="p-3 text-right space-x-2">
          ${app.status === 'confirmed' ? `
            <button onclick="changeAppointmentStatus('${app.id}', 'completed')" class="text-xs text-emerald-400 hover:underline">Concluir</button>
            <button onclick="changeAppointmentStatus('${app.id}', 'cancelled')" class="text-xs text-rose-400 hover:underline">Cancelar</button>
          ` : `
            <button onclick="changeAppointmentStatus('${app.id}', 'confirmed')" class="text-xs text-slate-400 hover:underline">Reativar</button>
          `}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erro ao buscar agendamentos:', err);
  }
}

function openNewAppointmentModal() {
  document.getElementById('modalAppointment').classList.remove('hidden');
}

function closeAppointmentModal() {
  document.getElementById('modalAppointment').classList.add('hidden');
}

async function handleSaveAppointment(e) {
  e.preventDefault();
  const body = {
    clientName: document.getElementById('appClientName').value,
    clientPhone: document.getElementById('appClientPhone').value,
    date: document.getElementById('appDate').value,
    time: document.getElementById('appTime').value,
    service: document.getElementById('appService').value,
    notes: document.getElementById('appNotes').value,
  };

  try {
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      closeAppointmentModal();
      fetchAppointments();
    }
  } catch (e) {
    alert('Erro ao registrar agendamento.');
  }
}

async function changeAppointmentStatus(id, status) {
  try {
    await fetch(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetchAppointments();
  } catch (e) {
    alert('Erro ao alterar status.');
  }
}

// Simulador de Chat
async function handleSendSimulation(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  const container = document.getElementById('chatMessagesContainer');

  // Adiciona bolha do usuário
  const userBubble = document.createElement('div');
  userBubble.className = 'flex justify-end';
  userBubble.innerHTML = `<div class="chat-bubble-user p-3 max-w-[80%] text-sm">${message}</div>`;
  container.appendChild(userBubble);
  input.value = '';
  container.scrollTop = container.scrollHeight;

  // Placeholder digitando
  const typingBubble = document.createElement('div');
  typingBubble.id = 'typingIndicator';
  typingBubble.className = 'flex justify-start';
  typingBubble.innerHTML = `<div class="chat-bubble-bot p-3 text-xs text-slate-400 italic">Sofia está digitando...</div>`;
  container.appendChild(typingBubble);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/chat/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, clientPhone: '5511999990000', clientName: 'Você (Simulador)' })
    });
    const data = await res.json();
    typingBubble.remove();

    const botBubble = document.createElement('div');
    botBubble.className = 'flex justify-start';
    botBubble.innerHTML = `<div class="chat-bubble-bot p-3 max-w-[80%] text-sm whitespace-pre-wrap">${data.reply || 'Sem resposta.'}</div>`;
    container.appendChild(botBubble);
    container.scrollTop = container.scrollHeight;

    // Atualiza tabela de agendamentos caso tenha sido feito novo agendamento
    fetchAppointments();
  } catch (err) {
    typingBubble.remove();
    const errorBubble = document.createElement('div');
    errorBubble.className = 'flex justify-start';
    errorBubble.innerHTML = `<div class="chat-bubble-bot p-3 max-w-[80%] text-sm text-rose-400">Erro ao comunicar com a secretária virtual.</div>`;
    container.appendChild(errorBubble);
  }
}
