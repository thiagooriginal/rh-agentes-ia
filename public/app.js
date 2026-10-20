let currentTab = 'dashboard';
let financialChart = null;

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();
  fetchStatus();
  fetchDashboardKPIs();
  fetchAppointments();
  fetchProfessionals();
  fetchServices();
  fetchClients();
  fetchFinancialData();
  fetchReviews();
  fetchSettings();

  // Polling regular a cada 4 segundos
  setInterval(() => {
    fetchStatus();
    if (currentTab === 'dashboard') fetchDashboardKPIs();
    if (currentTab === 'agenda') fetchAppointments();
  }, 4000);
});

function setTab(tabId) {
  currentTab = tabId;

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('bg-purple-600/15', 'text-purple-400', 'border-purple-500/20');
    btn.classList.add('text-slate-400', 'border-transparent');
  });

  const activeBtn = document.getElementById(`nav-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-purple-600/15', 'text-purple-400', 'border-purple-500/20');
    activeBtn.classList.remove('text-slate-400', 'border-transparent');
  }

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) activePane.classList.remove('hidden');

  if (tabId === 'dashboard') fetchDashboardKPIs();
  if (tabId === 'agenda') fetchAppointments();
  if (tabId === 'professionals') fetchProfessionals();
  if (tabId === 'services') fetchServices();
  if (tabId === 'clients') fetchClients();
  if (tabId === 'financial') fetchFinancialData();
  if (tabId === 'reviews') fetchReviews();
  if (tabId === 'campaigns') loadCampaigns();

  if (window.lucide) window.lucide.createIcons();
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('hidden');
}

// --- STATUS & WHATSAPP ---
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    const est = data.establishment || {};
    if (est.name) document.getElementById('headerSalonName').innerText = est.name;
    if (est.secretaryName) document.getElementById('headerSecretaryName').innerText = est.secretaryName;

    // Badge Gemini
    const badgeGemini = document.getElementById('badgeGemini');
    if (data.hasGeminiApiKey) {
      badgeGemini.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span class="text-emerald-300">Gemini: Ativo</span>';
    } else {
      badgeGemini.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span><span class="text-amber-300">Gemini: Sem Chave</span>';
    }

    // Badge WhatsApp Topo & Linha 1 (Salão)
    const badgeWA = document.getElementById('badgeWA');
    const badgeSalonLineStatus = document.getElementById('badgeSalonLineStatus');
    const qrLoading = document.getElementById('qrLoading');
    const qrImg = document.getElementById('qrImg');
    const qrOk = document.getElementById('qrOk');
    const qrConnectedPhone = document.getElementById('qrConnectedPhone');

    const wa = data.whatsapp || {};
    if (wa.state === 'connected') {
      badgeWA.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span class="text-emerald-300">Salão: Conectado</span>';
      if (badgeSalonLineStatus) {
        badgeSalonLineStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        badgeSalonLineStatus.innerText = 'CONECTADO';
      }
      qrLoading.classList.add('hidden');
      qrImg.classList.add('hidden');
      qrOk.classList.remove('hidden');
      qrConnectedPhone.innerText = `Número: +${wa.phoneNumber || 'Ativo'}`;
    } else if (wa.state === 'qr_ready' && wa.qrCodeDataUrl) {
      badgeWA.innerHTML = '<span class="w-2 h-2 rounded-full bg-sky-400"></span><span class="text-sky-300">Salão: Escanear QR</span>';
      if (badgeSalonLineStatus) {
        badgeSalonLineStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse';
        badgeSalonLineStatus.innerText = 'ESCANEAR QR';
      }
      qrLoading.classList.add('hidden');
      qrOk.classList.add('hidden');
      qrImg.src = wa.qrCodeDataUrl;
      qrImg.classList.remove('hidden');
    } else {
      badgeWA.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span><span class="text-slate-400">Salão: Desconectado</span>';
      if (badgeSalonLineStatus) {
        badgeSalonLineStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
        badgeSalonLineStatus.innerText = 'DESCONECTADO';
      }
      qrImg.classList.add('hidden');
      qrOk.classList.add('hidden');
      qrLoading.classList.remove('hidden');
    }

    // Linha 2 (Portal das IAs)
    const pwa = data.portalWhatsapp || {};
    const badgePortalLineStatus = document.getElementById('badgePortalLineStatus');
    const portalQrLoading = document.getElementById('portalQrLoading');
    const portalQrImg = document.getElementById('portalQrImg');
    const portalQrOk = document.getElementById('portalQrOk');
    const portalQrConnectedPhone = document.getElementById('portalQrConnectedPhone');

    if (portalQrLoading && portalQrImg && portalQrOk) {
      if (pwa.state === 'connected') {
        if (badgePortalLineStatus) {
          badgePortalLineStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
          badgePortalLineStatus.innerText = 'CONECTADO';
        }
        portalQrLoading.classList.add('hidden');
        portalQrImg.classList.add('hidden');
        portalQrOk.classList.remove('hidden');
        if (portalQrConnectedPhone) portalQrConnectedPhone.innerText = `Número: +${pwa.phoneNumber || 'Ativo'}`;
      } else if (pwa.state === 'qr_ready' && pwa.qrCodeDataUrl) {
        if (badgePortalLineStatus) {
          badgePortalLineStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse';
          badgePortalLineStatus.innerText = 'ESCANEAR QR';
        }
        portalQrLoading.classList.add('hidden');
        portalQrOk.classList.add('hidden');
        portalQrImg.src = pwa.qrCodeDataUrl;
        portalQrImg.classList.remove('hidden');
      } else {
        if (badgePortalLineStatus) {
          badgePortalLineStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
          badgePortalLineStatus.innerText = 'DESCONECTADO';
        }
        portalQrImg.classList.add('hidden');
        portalQrOk.classList.add('hidden');
        portalQrLoading.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Erro ao buscar status:', err);
  }
}

async function resetWA() {
  if (!confirm('Deseja limpar chaves residuais e gerar um novo QR Code do zero para a Linha 1 (Salão)?')) return;
  try {
    const res = await fetch('/api/whatsapp/reset', { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Sessão do Salão resetada!');
    fetchStatus();
  } catch (e) {
    alert('Erro ao resetar Linha 1.');
  }
}

async function resetPortalWA() {
  if (!confirm('Deseja limpar chaves residuais e gerar um novo QR Code do zero para a Linha 2 (Portal das IAs)?')) return;
  try {
    const res = await fetch('/api/portal/whatsapp/reset', { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Sessão do Portal resetada!');
    fetchStatus();
  } catch (e) {
    alert('Erro ao resetar Linha 2.');
  }
}

function togglePairingBox(line) {
  const boxId = line === 'portal' ? 'pairingBoxPortal' : 'pairingBoxSalon';
  const box = document.getElementById(boxId);
  if (!box) return;
  box.classList.toggle('hidden');
}

async function submitPairingCode(line) {
  const inputId = line === 'portal' ? 'inputPairingPortal' : 'inputPairingSalon';
  const displayBoxId = line === 'portal' ? 'codeDisplayPortal' : 'codeDisplaySalon';
  const valId = line === 'portal' ? 'codeValPortal' : 'codeValSalon';

  const input = document.getElementById(inputId);
  const phone = input ? input.value.trim() : '';
  if (!phone || phone.length < 10) {
    alert('Informe o DDD + número do WhatsApp (ex: 11999998888)');
    return;
  }

  const endpoint = line === 'portal' ? '/api/portal/whatsapp/pairing-code' : '/api/whatsapp/pairing-code';
  const displayBox = document.getElementById(displayBoxId);
  const valEl = document.getElementById(valId);

  if (valEl) valEl.innerText = 'Gerando...';
  if (displayBox) displayBox.classList.remove('hidden');

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (data.success && data.code) {
      if (valEl) valEl.innerText = data.code;
    } else {
      alert('Erro: ' + (data.error || 'Não foi possível gerar código'));
      if (displayBox) displayBox.classList.add('hidden');
    }
  } catch (e) {
    alert('Falha ao comunicar com o servidor.');
    if (displayBox) displayBox.classList.add('hidden');
  }
}

// --- DASHBOARD KPIS & GRÁFICO ---
async function fetchDashboardKPIs() {
  try {
    const res = await fetch('/api/dashboard/kpis');
    const kpis = await res.json();

    document.getElementById('kpiTodayCount').innerText = kpis.todayCount || 0;
    document.getElementById('kpiMonthCount').innerText = kpis.monthAppointmentsCount || 0;
    document.getElementById('kpiAttendanceRate').innerText = `${kpis.attendanceRate || 100}% comparecimento`;
    document.getElementById('kpiGrossRevenue').innerText = `R$ ${kpis.grossRevenue.toFixed(2)}`;
    document.getElementById('kpiAvgRating').innerHTML = `<span>${kpis.averageRating}</span><span class="text-sm">⭐</span>`;
    document.getElementById('kpiReviewsCount').innerText = `${kpis.reviewsCount} avaliações`;

    // DRE Card
    const dre = kpis.dre || {};
    document.getElementById('dreServ').innerText = `R$ ${(dre.totalServiceRevenue || 0).toFixed(2)}`;
    document.getElementById('dreRent').innerText = `R$ ${(dre.totalRentChairRevenue || 0).toFixed(2)}`;
    document.getElementById('drePayout').innerText = `R$ ${(dre.totalProfessionalPayout || 0).toFixed(2)}`;
    document.getElementById('dreExp').innerText = `R$ ${(dre.totalExpenses || 0).toFixed(2)}`;
    document.getElementById('dreNet').innerText = `R$ ${(dre.estimatedNetResult || 0).toFixed(2)}`;

    // Atualiza Chart.js
    renderFinancialChart(dre);
  } catch (err) {
    console.error('Erro ao carregar KPIs:', err);
  }
}

function renderFinancialChart(dre) {
  const ctx = document.getElementById('chartFinancial');
  if (!ctx) return;

  const labels = ['Faturamento Bruto', 'Repasse Profissionais', 'Despesas Operacionais', 'Lucro Líquido Salão'];
  const values = [
    dre.totalGrossRevenue || 0,
    dre.totalProfessionalPayout || 0,
    dre.totalExpenses || 0,
    dre.estimatedNetResult || 0
  ];

  if (financialChart) {
    financialChart.data.datasets[0].data = values;
    financialChart.update();
    return;
  }

  financialChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'R$ no Mês',
        data: values,
        backgroundColor: [
          'rgba(168, 85, 247, 0.7)',
          'rgba(244, 63, 94, 0.7)',
          'rgba(239, 68, 68, 0.7)',
          'rgba(16, 185, 129, 0.7)'
        ],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: '#334155' }
        },
        x: {
          ticks: { color: '#cbd5e1' },
          grid: { display: false }
        }
      }
    }
  });
}

// --- AGENDAMENTOS ---
async function fetchAppointments() {
  try {
    const date = document.getElementById('filterDate')?.value;
    const prof = document.getElementById('filterProf')?.value;
    const status = document.getElementById('filterStatus')?.value;

    let url = '/api/appointments?';
    if (date) url += `date=${date}&`;
    if (prof) url += `professionalId=${prof}&`;
    if (status) url += `status=${status}&`;

    const res = await fetch(url);
    const apps = await res.json();
    const tbody = document.getElementById('tableAppointmentsBody');
    tbody.innerHTML = '';

    if (apps.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-500">Nenhum agendamento encontrado para o filtro.</td></tr>';
      return;
    }

    apps.forEach(a => {
      let badge = '';
      if (a.status === 'CONFIRMADO') badge = '<span class="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-semibold">Confirmado</span>';
      else if (a.status === 'CONCLUIDO') badge = '<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold">Concluído</span>';
      else if (a.status === 'CANCELADO') badge = '<span class="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-400 font-semibold">Cancelado</span>';
      else if (a.status === 'NAO_COMPARECEU') badge = '<span class="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 font-semibold">Não compareceu</span>';
      else badge = `<span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-semibold">${a.status}</span>`;

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-900/60 transition';
      tr.innerHTML = `
        <td class="p-3 font-mono font-bold text-slate-400">${a.id}</td>
        <td class="p-3 font-medium text-slate-200">${a.date} às ${a.startTime}</td>
        <td class="p-3 text-slate-200">${a.clientName} <span class="text-slate-500 block text-[10px]">${a.clientPhone}</span></td>
        <td class="p-3 text-purple-300 font-medium">${a.professionalName}</td>
        <td class="p-3 text-slate-300">${a.serviceName}</td>
        <td class="p-3 font-semibold text-slate-200">R$ ${a.priceCharged.toFixed(2)}</td>
        <td class="p-3">${badge}</td>
        <td class="p-3 text-right space-x-1.5 whitespace-nowrap">
          ${a.status === 'CONFIRMADO' ? `
            <button onclick="changeAppStatus('${a.id}', 'CONCLUIDO')" class="text-emerald-400 hover:underline">Concluir</button>
            <button onclick="changeAppStatus('${a.id}', 'CANCELADO')" class="text-rose-400 hover:underline">Cancelar</button>
            <button onclick="changeAppStatus('${a.id}', 'NAO_COMPARECEU')" class="text-amber-400 hover:underline">No-show</button>
          ` : `
            <span class="text-slate-600 text-[10px]">Finalizado</span>
          `}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erro ao buscar agendamentos:', err);
  }
}

async function changeAppStatus(id, status) {
  try {
    await fetch(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetchAppointments();
    fetchDashboardKPIs();
  } catch (e) {
    alert('Erro ao atualizar status.');
  }
}

function openNewAppointmentModal() {
  document.getElementById('modalNewApp').classList.remove('hidden');
}

async function handleSaveManualApp(e) {
  e.preventDefault();
  const body = {
    clientName: document.getElementById('mAppClientName').value,
    clientPhone: document.getElementById('mAppClientPhone').value,
    professionalId: document.getElementById('mAppProf').value,
    serviceId: document.getElementById('mAppService').value,
    date: document.getElementById('mAppDate').value,
    startTime: document.getElementById('mAppTime').value,
  };

  try {
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      closeModal('modalNewApp');
      fetchAppointments();
      fetchDashboardKPIs();
      alert('Agendamento realizado com sucesso!');
    } else {
      alert(data.error || 'Erro ao realizar agendamento.');
    }
  } catch (e) {
    alert('Erro na requisição.');
  }
}

// --- PROFISSIONAIS ---
async function fetchProfessionals() {
  try {
    const res = await fetch('/api/professionals');
    const profs = await res.json();

    // Atualiza selects
    const selectFilter = document.getElementById('filterProf');
    const selectModal = document.getElementById('mAppProf');
    if (selectFilter) {
      selectFilter.innerHTML = '<option value="">Todas as profissionais</option>' + profs.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }
    if (selectModal) {
      selectModal.innerHTML = profs.map(p => `<option value="${p.id}">${p.name} (${p.specialty})</option>`).join('');
    }

    // Grid de cards
    const grid = document.getElementById('gridProfessionals');
    if (!grid) return;
    grid.innerHTML = '';

    profs.forEach(p => {
      const rule = p.financialRule || {};
      let ruleDesc = '';
      if (rule.type === 'PERCENTUAL') {
        ruleDesc = `Percentual: ${rule.percentProfessional}% Profissional / ${rule.percentSalon}% Salão`;
      } else if (rule.type === 'ALUGUEL_FIXO') {
        ruleDesc = `Aluguel Fixo de Cadeira: R$ ${rule.fixedRentMonthly?.toFixed(2)}/mês (Vence dia ${rule.rentDueDay})`;
      } else {
        ruleDesc = `Funcionário Fixo`;
      }

      const card = document.createElement('div');
      card.className = 'p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between';
      card.innerHTML = `
        <div>
          <div class="flex items-center gap-3 mb-3">
            <div class="w-11 h-11 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 text-white font-bold flex items-center justify-center text-sm shadow-md">
              ${p.name.charAt(0)}
            </div>
            <div>
              <h4 class="font-bold text-sm text-slate-100">${p.name}</h4>
              <p class="text-xs text-purple-300">${p.specialty}</p>
            </div>
          </div>
          <div class="space-y-1.5 text-xs text-slate-400 mt-2">
            <p>📞 ${p.phone}</p>
            <p class="p-2 rounded-lg bg-slate-950 text-[11px] text-slate-300 font-medium border border-slate-800">
              💼 ${ruleDesc}
            </p>
          </div>
        </div>
        <div class="pt-3 border-t border-slate-800/80 mt-4 flex justify-between items-center text-xs">
          <span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold">${p.status}</span>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error('Erro ao carregar profissionais:', err);
  }
}

// --- SERVIÇOS ---
async function fetchServices() {
  try {
    const res = await fetch('/api/services');
    const services = await res.json();

    const selectModal = document.getElementById('mAppService');
    if (selectModal) {
      selectModal.innerHTML = services.map(s => `<option value="${s.id}">${s.name} - R$ ${s.price.toFixed(2)} (${s.durationMinutes} min)</option>`).join('');
    }

    const grid = document.getElementById('gridServices');
    if (!grid) return;
    grid.innerHTML = '';

    services.forEach(s => {
      const card = document.createElement('div');
      card.className = 'p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between';
      card.innerHTML = `
        <div>
          <div class="flex justify-between items-start mb-2">
            <h4 class="font-bold text-sm text-slate-100">${s.name}</h4>
            <span class="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold">R$ ${s.price.toFixed(2)}</span>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">${s.category}</span>
          <p class="text-xs text-slate-400 mt-2">${s.description || 'Sem descrição.'}</p>
        </div>
        <div class="pt-3 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center mt-4">
          <span>⏱️ ${s.durationMinutes} minutos</span>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error('Erro ao buscar serviços:', err);
  }
}

// --- CLIENTES ---
async function fetchClients() {
  try {
    const res = await fetch('/api/clients');
    const clients = await res.json();
    const tbody = document.getElementById('tableClientsBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    clients.forEach(c => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-900/60 transition';
      tr.innerHTML = `
        <td class="p-3 font-semibold text-slate-100">${c.name}</td>
        <td class="p-3 text-slate-300">${c.phone}</td>
        <td class="p-3 text-purple-300 font-medium">${c.totalVisits || 0} visitas</td>
        <td class="p-3 font-semibold text-emerald-400">R$ ${(c.totalSpent || 0).toFixed(2)}</td>
        <td class="p-3 text-rose-400">${c.cancellationCount || 0}</td>
        <td class="p-3 text-amber-400">${c.noShowCount || 0}</td>
        <td class="p-3 text-slate-400">${c.lastVisit || c.firstVisit || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
  }
}

// --- FINANCEIRO ---
async function fetchFinancialData() {
  try {
    // Despesas
    const resExp = await fetch('/api/financial/expenses');
    const expenses = await resExp.json();
    const tbodyExp = document.getElementById('tableExpensesBody');
    if (tbodyExp) {
      tbodyExp.innerHTML = '';
      expenses.forEach(e => {
        const isPaid = e.status === 'PAGA';
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-900/60 transition';
        tr.innerHTML = `
          <td class="p-3 font-medium text-slate-200">${e.description} ${e.isRecurring ? '<span class="text-[10px] text-purple-400 font-semibold ml-1">(Recorrente)</span>' : ''}</td>
          <td class="p-3 text-slate-400">${e.category}</td>
          <td class="p-3 text-slate-300">${e.dueDate}</td>
          <td class="p-3 font-semibold text-rose-400">R$ ${e.amount.toFixed(2)}</td>
          <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] ${isPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'} font-semibold">${e.status}</span></td>
          <td class="p-3 text-right">
            ${!isPaid ? `<button onclick="markExpensePaid('${e.id}')" class="text-emerald-400 hover:underline">Marcar Paga</button>` : `<span class="text-slate-600 text-[10px]">Paga</span>`}
          </td>
        `;
        tbodyExp.appendChild(tr);
      });
    }

    // Receitas
    const resRev = await fetch('/api/financial/revenues');
    const revenues = await resRev.json();
    const tbodyRev = document.getElementById('tableRevenuesBody');
    if (tbodyRev) {
      tbodyRev.innerHTML = '';
      revenues.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-900/60 transition';
        tr.innerHTML = `
          <td class="p-3 font-medium text-slate-200">${r.description}</td>
          <td class="p-3 text-slate-400">${r.paymentMethod}</td>
          <td class="p-3 text-slate-300">${r.paidAt ? r.paidAt.split('T')[0] : '-'}</td>
          <td class="p-3 font-semibold text-emerald-400">R$ ${r.grossAmount.toFixed(2)}</td>
          <td class="p-3 text-purple-300">R$ ${r.valProfessional.toFixed(2)}</td>
          <td class="p-3 text-emerald-300 font-semibold">R$ ${r.valSalon.toFixed(2)}</td>
        `;
        tbodyRev.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Erro ao carregar dados financeiros:', err);
  }
}

function openNewExpenseModal() {
  document.getElementById('modalNewExpense').classList.remove('hidden');
}

async function handleSaveExpense(e) {
  e.preventDefault();
  const body = {
    description: document.getElementById('mExpDesc').value,
    category: document.getElementById('mExpCat').value,
    amount: parseFloat(document.getElementById('mExpAmount').value),
    dueDate: document.getElementById('mExpDueDate').value,
    status: 'A_VENCER',
    isRecurring: document.getElementById('mExpRec').value === 'true',
    recurrenceDay: parseInt(document.getElementById('mExpDueDate').value.split('-')[2])
  };

  try {
    await fetch('/api/financial/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    closeModal('modalNewExpense');
    fetchFinancialData();
    fetchDashboardKPIs();
  } catch (e) {
    alert('Erro ao salvar despesa.');
  }
}

async function markExpensePaid(id) {
  try {
    await fetch(`/api/financial/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PAGA', paidDate: new Date().toISOString().split('T')[0] })
    });
    fetchFinancialData();
    fetchDashboardKPIs();
  } catch (e) {
    alert('Erro ao atualizar despesa.');
  }
}

// --- AVALIAÇÕES ---
async function fetchReviews() {
  try {
    const res = await fetch('/api/reviews');
    const reviews = await res.json();
    const container = document.getElementById('listReviews');
    if (!container) return;
    container.innerHTML = '';

    if (reviews.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-500 col-span-2">Nenhuma avaliação registrada ainda.</p>';
      return;
    }

    reviews.forEach(r => {
      const isAlert = r.statusAlert === 'ALERTA_BAIXA_NOTA';
      const card = document.createElement('div');
      card.className = `p-4 rounded-2xl bg-slate-900 border ${isAlert ? 'border-rose-500/40 bg-rose-950/10' : 'border-slate-800'} flex flex-col justify-between`;
      card.innerHTML = `
        <div>
          <div class="flex justify-between items-start mb-2">
            <div>
              <h4 class="font-bold text-sm text-slate-100">${r.clientName}</h4>
              <p class="text-xs text-purple-300">Atendida por: ${r.professionalName}</p>
            </div>
            <div class="flex text-amber-400 text-sm">
              ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}
            </div>
          </div>
          <p class="text-xs text-slate-300 italic mt-2">"${r.comment}"</p>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-800/80 flex justify-between items-center text-[10px] text-slate-500">
          <span>${r.createdAt.split('T')[0]}</span>
          ${isAlert ? '<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">⚠️ ALERTA DE NOTA BAIXA</span>' : ''}
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Erro ao carregar avaliações:', err);
  }
}

// --- SIMULADOR DE CHAT IA ---
async function handleSendSimMessage(e) {
  e.preventDefault();
  const input = document.getElementById('simInput');
  const msg = input.value.trim();
  if (!msg) return;

  const container = document.getElementById('simMessagesContainer');

  const userDiv = document.createElement('div');
  userDiv.className = 'flex justify-end';
  userDiv.innerHTML = `<div class="chat-bubble-user p-3 text-xs max-w-[85%]">${msg}</div>`;
  container.appendChild(userDiv);
  input.value = '';
  container.scrollTop = container.scrollHeight;

  const typingDiv = document.createElement('div');
  typingDiv.className = 'flex justify-start';
  typingDiv.id = 'simTyping';
  typingDiv.innerHTML = `<div class="chat-bubble-bot p-2.5 text-[11px] text-slate-400 italic">Sofia está digitando...</div>`;
  container.appendChild(typingDiv);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/chat/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, clientPhone: '5511999990000', clientName: 'Você (Simulador)' })
    });
    const data = await res.json();
    typingDiv.remove();

    const botDiv = document.createElement('div');
    botDiv.className = 'flex justify-start';
    botDiv.innerHTML = `<div class="chat-bubble-bot p-3 text-xs max-w-[85%] whitespace-pre-wrap leading-relaxed">${data.reply || 'Sem resposta.'}</div>`;
    container.appendChild(botDiv);
    container.scrollTop = container.scrollHeight;

    // Atualiza agendamentos caso tenha sido criado
    fetchAppointments();
    fetchDashboardKPIs();
  } catch (err) {
    typingDiv.remove();
    const errDiv = document.createElement('div');
    errDiv.className = 'flex justify-start';
    errDiv.innerHTML = `<div class="chat-bubble-bot p-3 text-xs text-rose-400">Erro ao comunicar com a assistente.</div>`;
    container.appendChild(errDiv);
  }
}

// --- CONFIGURAÇÕES ---
async function fetchSettings() {
  try {
    const res = await fetch('/api/establishment');
    const est = await res.json();
    document.getElementById('cfgSalonName').value = est.name || '';
    document.getElementById('cfgSecretaryName').value = est.secretaryName || '';
    document.getElementById('cfgAddress').value = est.address || '';
    document.getElementById('cfgPhone').value = est.phone || '';
    document.getElementById('cfgTransferPhone').value = est.transferToHumanPhone || '';
    document.getElementById('cfgCompletionMode').value = est.completionMode || 'AUTO';
    document.getElementById('cfgLowRating').value = est.lowRatingThreshold || 2;
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

async function handleSaveEstablishment(e) {
  e.preventDefault();
  const geminiApiKey = document.getElementById('inputGeminiKey').value;
  const body = {
    name: document.getElementById('cfgSalonName').value,
    secretaryName: document.getElementById('cfgSecretaryName').value,
    address: document.getElementById('cfgAddress').value,
    phone: document.getElementById('cfgPhone').value,
    transferToHumanPhone: document.getElementById('cfgTransferPhone').value,
    completionMode: document.getElementById('cfgCompletionMode').value,
    lowRatingThreshold: parseInt(document.getElementById('cfgLowRating').value)
  };
  if (geminiApiKey) body.geminiApiKey = geminiApiKey;

  try {
    const res = await fetch('/api/establishment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      alert('Configurações atualizadas com sucesso!');
      document.getElementById('inputGeminiKey').value = '';
      fetchStatus();
      fetchSettings();
    }
  } catch (e) {
    alert('Erro ao salvar.');
  }
}

// --- PROMOÇÕES RELÂMPAGO & CAMPANHAS ANTI-BAN ---
let lastPreparedCampaignId = null;

async function loadCampaigns() {
  try {
    const res = await fetch('/api/campaigns');
    const campaigns = await res.json();
    const container = document.getElementById('campaignsList');
    if (!container) return;

    if (!campaigns || campaigns.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-500">Nenhuma campanha registrada ainda.</p>';
      return;
    }

    container.innerHTML = campaigns.slice().reverse().map(c => {
      const isRunning = c.status === 'EM_ANDAMENTO';
      const isDone = c.status === 'CONCLUIDO';
      const isDraft = c.status === 'RASCUNHO';
      const statusColor = isRunning ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
        isDone ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
        'bg-slate-800 text-slate-400 border-slate-700';

      const pct = c.totalRecipients > 0 ? Math.round((c.sentCount / c.totalRecipients) * 100) : 0;

      return `
        <div class="glass-card p-4 rounded-xl border border-slate-800 space-y-3">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-200">${c.title || 'Promoção Relâmpago'}</span>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor}">${c.status}</span>
              </div>
              <p class="text-[11px] text-slate-400 mt-0.5">Criada em: ${new Date(c.createdAt).toLocaleString('pt-BR')}</p>
            </div>
            <div class="flex items-center gap-2">
              ${isDraft ? `
                <button onclick="handleStartCampaignDirectly('${c.id}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <i data-lucide="play" class="w-3.5 h-3.5"></i>
                  <span>Disparar Agora</span>
                </button>
              ` : ''}
              ${isRunning ? `
                <button onclick="handleCancelCampaign('${c.id}')" class="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <i data-lucide="square" class="w-3.5 h-3.5"></i>
                  <span>Pausar</span>
                </button>
              ` : ''}
            </div>
          </div>

          <div class="p-2.5 bg-slate-950 rounded-lg text-xs text-slate-300 border border-slate-800/60">
            <span class="text-slate-500 block text-[10px] uppercase font-bold">Oferta:</span>
            ${c.rawDescription}
          </div>

          <!-- Barra de Progresso Anti-Ban -->
          <div class="space-y-1">
            <div class="flex justify-between text-[11px] text-slate-400">
              <span>Progresso dos envios: <b>${c.sentCount} / ${c.totalRecipients} clientes</b></span>
              <span>${pct}% concluído</span>
            </div>
            <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div class="bg-gradient-to-r from-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error('Erro ao carregar campanhas:', err);
  }
}

async function handlePrepareCampaign() {
  const title = document.getElementById('campTitle').value;
  const rawDescription = document.getElementById('campRawDesc').value;
  const minDelay = parseInt(document.getElementById('campMinDelay').value) || 25;
  const maxDelay = parseInt(document.getElementById('campMaxDelay').value) || 55;

  if (!rawDescription || rawDescription.trim().length === 0) {
    alert('Por favor, digite o texto ou condição da promoção.');
    return;
  }

  try {
    const res = await fetch('/api/campaigns/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, rawDescription, minDelay, maxDelay })
    });
    const data = await res.json();
    if (data.success) {
      lastPreparedCampaignId = data.campaign.id;
      document.getElementById('previewClientCount').innerText = `${data.totalEligibleClients} clientes na base`;
      document.getElementById('previewMessageContent').innerText = data.previewMessage;
      document.getElementById('boxCampaignPreview').classList.remove('hidden');
      loadCampaigns();
    } else {
      alert(data.error || 'Erro ao preparar campanha.');
    }
  } catch (e) {
    alert('Falha na comunicação com o servidor.');
  }
}

async function handleStartPreparedCampaign() {
  if (!lastPreparedCampaignId) return;
  await handleStartCampaignDirectly(lastPreparedCampaignId);
  document.getElementById('boxCampaignPreview').classList.add('hidden');
}

async function handleStartCampaignDirectly(id) {
  try {
    const res = await fetch(`/api/campaigns/${id}/start`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('Campanha iniciada com sucesso! Os envios estão ocorrendo em segundo plano com proteção anti-ban.');
      loadCampaigns();
    }
  } catch (e) {
    alert('Erro ao iniciar campanha.');
  }
}

async function handleCancelCampaign(id) {
  if (!confirm('Deseja interromper o envio desta campanha?')) return;
  try {
    const res = await fetch(`/api/campaigns/${id}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('Campanha interrompida.');
      loadCampaigns();
    }
  } catch (e) {
    alert('Erro ao cancelar campanha.');
  }
}

