export function requireCompleteIntegrationReport(report) {
  if (!report || report.success !== true || !Number.isInteger(report.numTotalTests) || report.numTotalTests < 1) {
    throw new Error('Integração obrigatória sem relatório de sucesso e testes executados.');
  }
  if (report.numFailedTests !== 0 || report.numPendingTests !== 0 ||
      (report.numTodoTests ?? 0) !== 0 || report.numPassedTests !== report.numTotalTests) {
    throw new Error('Integração obrigatória contém falhas ou testes omitidos.');
  }
  const assertions=(report.testResults ?? []).flatMap(file=>file.assertionResults ?? []);
  if (assertions.length !== report.numTotalTests || assertions.some(test=>test.status !== 'passed')) {
    throw new Error('Relatório de integração inconsistente ou com casos não aprovados.');
  }
}
