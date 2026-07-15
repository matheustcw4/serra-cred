function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    escreverAba(ss, 'Clientes', data.clientes, ['id','nome','telefone','documento','comercio','endereco','cidade','uf','rota','observacoes','criadoEm']);
    escreverAba(ss, 'Emprestimos', data.emprestimos, ['id','clienteId','valorEmprestado','valorTotal','numParcelas','prazoDias','taxa','dataEmprestimo','dataPrimeiraParcela','observacoes','criadoEm']);
    escreverAba(ss, 'Parcelas', data.parcelas, ['id','emprestimoId','numero','dataVencimento','valor','dataPagamento']);

    var resumo = ss.getSheetByName('Resumo') || ss.insertSheet('Resumo');
    resumo.clear();
    resumo.getRange(1, 1).setValue('Última sincronização:');
    resumo.getRange(1, 2).setValue(new Date());
    resumo.getRange(2, 1).setValue('Clientes:');
    resumo.getRange(2, 2).setValue((data.clientes || []).length);
    resumo.getRange(3, 1).setValue('Empréstimos:');
    resumo.getRange(3, 2).setValue((data.emprestimos || []).length);
    resumo.getRange(4, 1).setValue('Parcelas:');
    resumo.getRange(4, 2).setValue((data.parcelas || []).length);

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, erro: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function escreverAba(ss, nome, linhas, colunas) {
  var sheet = ss.getSheetByName(nome);
  if (!sheet) sheet = ss.insertSheet(nome);
  sheet.clear();
  sheet.getRange(1, 1, 1, colunas.length).setValues([colunas]);
  linhas = linhas || [];
  if (linhas.length > 0) {
    var valores = linhas.map(function (linha) {
      return colunas.map(function (col) {
        var v = linha[col];
        return v === undefined || v === null ? '' : v;
      });
    });
    sheet.getRange(2, 1, valores.length, colunas.length).setValues(valores);
  }
}
