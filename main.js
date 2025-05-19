const form = document.getElementById('comissaoForm');
const resultado = document.getElementById('resultado');
const percentualInput = document.getElementById('percentual');
const listaSelecionados = document.getElementById('listaSelecionados');


let pacotes = [];

Promise.all([
  fetch('servicos.json').then(r => r.json()),
  fetch('pacotes.json').then(r => r.json())
]).then(([servicos, pacotesData]) => {
  pacotes = pacotesData;
  mostrarPacotesDisponiveis(servicos);

  servicos.forEach((s, i) => {
    if (s.nome.toLowerCase().startsWith('pacote ')) return;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'item';
    if (s.desativado) itemDiv.classList.add('disabled');

    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.id = s.id || String(i);
    cb.dataset.min = s.min;
    cb.dataset.max = s.max;
    if (s.desativado) cb.disabled = true;

    label.appendChild(cb);
    label.appendChild(document.createTextNode(
      ` ${s.nome} — ${s.descricao_basica || ''} — R$${s.min} – R$${s.max}`
    ));
    const dataHoraSpan = document.getElementById('data-hora-geracao');

    const agora = new Date();

    const meiaHoraAntes = new Date(agora);
    meiaHoraAntes.setMinutes(agora.getMinutes() - 30);

    const meiaHoraDepois = new Date(agora);
    meiaHoraDepois.setMinutes(agora.getMinutes() + 30);

    const dataFormatada = agora.toLocaleDateString('pt-BR');
    const horaAntesFormatada = meiaHoraAntes.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const horaDepoisFormatada = meiaHoraDepois.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    dataHoraSpan.textContent = `${dataFormatada} entre às ${horaAntesFormatada} - ${horaDepoisFormatada} horas`;

    const qtd = document.createElement('input');
    qtd.type = 'number';
    qtd.className = 'quantidade';
    qtd.min = 1;
    qtd.value = 1;
    qtd.disabled = true;

    const precoInput = document.createElement('input');
    precoInput.type = 'number';
    precoInput.className = 'precoCustomizado';
    precoInput.min = s.min;
    precoInput.max = s.max;
    precoInput.value = '';
    precoInput.placeholder = `Entre R$${s.min} e R$${s.max}`;
    precoInput.disabled = true;

    itemDiv.append(label, qtd, precoInput);
    form.appendChild(itemDiv);
  });

  form.addEventListener('change', e => {
    if (e.target.type === 'checkbox') {
      const item = e.target.closest('.item');
      const qtd = item.querySelector('.quantidade');
      const precoInput = item.querySelector('.precoCustomizado');
      qtd.disabled = !e.target.checked;
      precoInput.disabled = !e.target.checked;
      if (!e.target.checked) {
        qtd.value = 1;
        precoInput.value = '';
      }
    }
    atualizarCalculo();
    salvarEstado(); 
  });

  percentualInput.addEventListener('input', () => {
    atualizarCalculo();
    salvarEstado(); 
  });

  const acordoVerbal = document.getElementById('acordoVerbal');
  if (acordoVerbal) {
    acordoVerbal.addEventListener('input', () => {
      salvarEstado();
    });
  }

  carregarEstado(); 
  atualizarCalculo();
})
.catch(err => console.error('Erro carregando JSONs:', err));

function aplicarPacotes(itensSelecionados) {
  const itensDisponiveis = itensSelecionados.map(i => ({ ...i }));
  pacotes.sort((a, b) => b.desconto - a.desconto);

  for (const pacote of pacotes) {
    let aplicarMais = true;
    while (aplicarMais) {
      const podeAplicar = pacote.servicos.every(req => {
        const item = itensDisponiveis.find(i => i.id === req.id);
        return item && item.q >= req.quantidade;
      });

      if (!podeAplicar) break;

      for (const req of pacote.servicos) {
        const item = itensDisponiveis.find(i => i.id === req.id);
        item.q -= req.quantidade;
        const original = itensSelecionados.find(i => i.id === item.id);
        if (!original.pacoteAplicado) original.pacoteAplicado = [];
        original.pacoteAplicado.push({
          nome: pacote.nome,
          desconto: pacote.desconto,
          quantidade: req.quantidade
        });
      }
    }
  }

  return itensSelecionados;
}

function gerarDescricaoDetalhada(itensSelecionados) {
  if (!itensSelecionados || itensSelecionados.length === 0) {
    return "Nenhum item selecionado.";
  }

  let texto = "";

  itensSelecionados.forEach(item => {
    const nome = item.label.replace(/R\$\d+(?:\.\d{2})?(?:\s*–\s*R\$\d+(?:\.\d{2})?)?/, '').trim();

    texto += `${item.q}x ${nome}`;

    if (item.pacoteAplicado && item.pacoteAplicado.length > 0) {
      texto += " (com desconto aplicado: ";
      texto += item.pacoteAplicado.map(p => `${p.nome} ${p.desconto}% de desconto em ${p.quantidade} un.`).join(', ');
      texto += ")";
    }

    texto += ".\n";
  });

  return texto.trim();
}

function atualizarCalculo() {
  let totalMin = 0, totalMax = 0;
  let totalComPacote = 0;

  const selecionados = [];

  document.querySelectorAll('.item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    const qtdInput = item.querySelector('.quantidade');
    const precoInput = item.querySelector('.precoCustomizado');
    if (cb && !cb.disabled && cb.checked) {
      const id = cb.dataset.id;
      const q = parseInt(qtdInput.value) || 1;
      const precoCustom = parseFloat(precoInput.value);
      const precoValido = !isNaN(precoCustom) && precoCustom >= +cb.dataset.min && precoCustom <= +cb.dataset.max;

      const labelText = cb.parentNode.childNodes[1]?.textContent.trim() || '';

      selecionados.push({
        id,
        label: labelText,
        q,
        min: +cb.dataset.min,
        max: +cb.dataset.max,
        preco: precoValido ? precoCustom : +cb.dataset.min
      });
    }
  });

  selecionados.forEach(i => {
    totalMin += i.min * i.q;
    totalMax += i.max * i.q;
  });

  selecionados.forEach(i => { delete i.pacoteAplicado; });

  aplicarPacotes(selecionados);

  selecionados.forEach(item => {
    let resto = item.q;
    if (item.pacoteAplicado) {
      item.pacoteAplicado.forEach(p => {
        const qDesc = p.quantidade;
        const fator = 1 - p.desconto / 100;
        totalComPacote += item.preco * qDesc * fator;
        resto -= qDesc;
      });
    }
    totalComPacote += item.preco * resto;
  });

  let pct = parseFloat(percentualInput.value);
  if (isNaN(pct) || pct < 0) pct = 0;
  const fatorDesconto = 1 - pct / 100;

  const precoFinal = totalComPacote * fatorDesconto;

  const pacotesUsados = selecionados.flatMap(i => i.pacoteAplicado || [])
    .map(p => `${p.nome} (${p.desconto}% de desconto)`)
    .filter((v, i, a) => a.indexOf(v) === i);

  resultado.innerHTML = document.getElementById('totalMin').textContent = `R$${totalMin.toFixed(2)}`;
  document.getElementById('totalMax').textContent = `R$${totalMax.toFixed(2)}`;
  document.getElementById('totalComPacote').textContent = `R$${totalComPacote.toFixed(2)}`;
  document.getElementById('fatorDesconto').textContent = `${pct.toFixed(2)}%`;
  document.getElementById('precoFinal').textContent = `R$${precoFinal.toFixed(2)}`;

  const pacotesUsadosTexto = pacotesUsados.length > 0 ? pacotesUsados.join(', ') : 'Nenhum pacote aplicado';
  document.getElementById('pacotesAplicados').textContent = pacotesUsadosTexto;

  listaSelecionados.innerHTML = '';
  const descricaoEl = document.getElementById('descricaoDetalhada');
  if (descricaoEl) {
    descricaoEl.textContent = gerarDescricaoDetalhada(selecionados);
  }
  if (selecionados.length === 0) {
    listaSelecionados.innerHTML = '<li>Nenhum serviço selecionado</li>';
  } else {
    selecionados.forEach(item => {
      let texto = `${item.label.replace(/R\$\d+(?:\.\d{2})?(?:\s*–\s*R\$\d+(?:\.\d{2})?)?/, `R$${item.preco.toFixed(2)}`)} (x${item.q})`;

      let resto = item.q;
      let somaItem = 0;

      if (item.pacoteAplicado) {
        item.pacoteAplicado.forEach(p => {
          const valorComDesconto = item.preco * p.quantidade * (1 - p.desconto / 100);
          texto += ` | ${p.nome} (${p.desconto}%) em ${p.quantidade} un. → R$${valorComDesconto.toFixed(2)}`;
          somaItem += valorComDesconto;
          resto -= p.quantidade;
        });
      }
      if (resto > 0) {
        const valorSemDesconto = item.preco * resto;
        texto += ` | Sem desconto → R$${valorSemDesconto.toFixed(2)}`;
        somaItem += valorSemDesconto;
      }

      texto += ` | Total: R$${somaItem.toFixed(2)}`;

      const li = document.createElement('li');
      li.textContent = texto;
      listaSelecionados.appendChild(li);
    });
  }
}

function salvarEstado() {
  const dados = {
    selecionados: [],
    percentual: percentualInput.value,
    acordoVerbal: document.getElementById('acordoVerbal')?.value || ''
  };

  document.querySelectorAll('.item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    const qtd = item.querySelector('.quantidade');
    const preco = item.querySelector('.precoCustomizado');

    if (cb && cb.checked) {
      dados.selecionados.push({
        id: cb.dataset.id,
        quantidade: qtd.value,
        preco: preco.value
      });
    }
  });

  localStorage.setItem('estadoComissao', JSON.stringify(dados));
}

function carregarEstado() {
  const estadoSalvo = localStorage.getItem('estadoComissao');
  if (!estadoSalvo) return;

  const dados = JSON.parse(estadoSalvo);

  if (dados.percentual !== undefined) percentualInput.value = dados.percentual;
  if (dados.acordoVerbal !== undefined) document.getElementById('acordoVerbal').value = dados.acordoVerbal;

  document.querySelectorAll('.item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    const qtd = item.querySelector('.quantidade');
    const preco = item.querySelector('.precoCustomizado');

    const selecionado = dados.selecionados.find(s => s.id === cb.dataset.id);

    if (selecionado) {
      cb.checked = true;
      qtd.disabled = false;
      preco.disabled = false;
      qtd.value = selecionado.quantidade;
      preco.value = selecionado.preco;
    } else {
      cb.checked = false;
      qtd.disabled = true;
      preco.disabled = true;
      qtd.value = 1;
      preco.value = '';
    }
  });
}

function mostrarPacotesDisponiveis(servicos) {
  const lista = document.getElementById('pacotesDisponiveis');
  if (!lista) return;

  lista.innerHTML = '';

  pacotes.forEach(pacote => {
    const li = document.createElement('li');
    li.classList.add('pacote-item');
    li.style.cursor = 'pointer';

    const itens = pacote.servicos.map(s => {
      const servico = servicos.find(srv => srv.id === s.id);
      const nome = servico ? servico.nome : `ID ${s.id}`;
      return `${s.quantidade}x ${nome}`;
    }).join(', ');

    li.textContent = `${pacote.nome} → ${pacote.desconto}% de desconto | Requisitos: ${itens}`;
    lista.appendChild(li);

li.addEventListener('click', () => {
  pacote.servicos.forEach(req => {
    const cb = document.querySelector(`input[type="checkbox"][data-id="${req.id}"]`);
    const item = cb?.closest('.item');
    const qtd = item?.querySelector('.quantidade');
    const preco = item?.querySelector('.precoCustomizado');

    if (cb && qtd && preco) {
      cb.checked = true;
      cb.disabled = false;
      qtd.disabled = false;

      const atual = parseInt(qtd.value) || 0;
      qtd.value = atual + req.quantidade;

      preco.disabled = false;
    }
  });

  atualizarCalculo();
  salvarEstado();
});
  });

  const acordoVerbal = document.getElementById('acordoVerbal');

  acordoVerbal.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });

  window.addEventListener('load', () => {
    acordoVerbal.style.height = 'auto';
    acordoVerbal.style.height = acordoVerbal.scrollHeight + 'px';
  });
}

