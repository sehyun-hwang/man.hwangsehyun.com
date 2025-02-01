// @ts-check

import _builder from 'junit-report-builder';

/**
 * @type import('junit-report-builder').Builder
 */
// @ts-ignore
const factory = _builder;

/**
 * @param {Record<string, Set<string> | string[]>} arg
 * @returns {import('junit-report-builder').Builder}
 */
export default function buildSuite({ localPaths, ...results }) {
  const builder = factory.newBuilder();
  const suite = builder.testSuite().name('');

  localPaths.forEach(path => suite.testCase().name(path));

  Object.entries(results).forEach(([key, values]) => {
    values.forEach(path => suite.testCase().name(path).error(key));
  });

  console.log({
    error: suite.getErrorCount(),
    failure: suite.getFailureCount(),
    skipped: suite.getSkippedCount(),
    testCaseCount: suite.getTestCaseCount(),
  });

  return builder;
}
