const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');

const OPENAPI_PATH = path.resolve(__dirname, '../openapi.yaml');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function hasExample(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.example !== undefined) return true;
  if (obj.examples && typeof obj.examples === 'object' && Object.keys(obj.examples).length > 0) return true;
  if (obj.schema && typeof obj.schema === 'object') {
    if (obj.schema.example !== undefined) return true;
    if (obj.schema.examples && Object.keys(obj.schema.examples).length > 0) return true;
  }
  return false;
}

function operationHasExample(operation) {
  // Check parameters
  const params = operation.parameters || [];
  if (params.some(hasExample)) return true;

  // Check request body
  if (operation.requestBody && operation.requestBody.content) {
    const contents = Object.values(operation.requestBody.content);
    if (contents.some(hasExample)) return true;
  }

  // Check responses
  if (operation.responses) {
    const responses = Object.values(operation.responses);
    if (responses.some((r) => r && r.content && Object.values(r.content).some(hasExample))) return true;
  }

  return false;
}

function operationHasErrorResponse(operation) {
  if (!operation.responses) return false;
  return Object.keys(operation.responses).some((code) => {
    const numeric = parseInt(code, 10);
    if (!isNaN(numeric)) return numeric >= 400;
    return code === 'default';
  });
}

SwaggerParser.validate(OPENAPI_PATH)
  .then((api) => {
    const problems = [];
    let operationCount = 0;
    let documentedCount = 0;
    let exampleCount = 0;
    let errorResponseCount = 0;

    Object.entries(api.paths).forEach(([routePath, pathItem]) => {
      if (!pathItem || typeof pathItem !== 'object') return;
      HTTP_METHODS.forEach((method) => {
        const operation = pathItem[method];
        if (!operation) return;
        operationCount++;
        const label = `${method.toUpperCase()} ${routePath}`;

        const hasSummary = typeof operation.summary === 'string' && operation.summary.trim().length > 0;
        const hasDescription =
          typeof operation.description === 'string' && operation.description.trim().length > 0;

        if (!hasSummary) {
          problems.push(`${label}: missing summary`);
        }
        if (!hasDescription) {
          problems.push(`${label}: missing description`);
        }
        if (hasSummary && hasDescription) {
          documentedCount++;
        }

        if (!operationHasErrorResponse(operation)) {
          problems.push(`${label}: missing error response (4xx/5xx/default)`);
        } else {
          errorResponseCount++;
        }

        if (!operationHasExample(operation)) {
          problems.push(`${label}: missing example`);
        } else {
          exampleCount++;
        }
      });
    });

    if (operationCount === 0) {
      problems.push('No operations found in OpenAPI spec');
    }

    const pct = (n) => (operationCount === 0 ? 0 : Math.round((n / operationCount) * 100));

    console.log(`OpenAPI spec is valid: ${Object.keys(api.paths).length} paths, ${operationCount} operations`);
    console.log('Documentation coverage:');
    console.log(`  Summaries + descriptions: ${documentedCount}/${operationCount} (${pct(documentedCount)}%)`);
    console.log(`  Error responses:          ${errorResponseCount}/${operationCount} (${pct(errorResponseCount)}%)`);
    console.log(`  Examples:                 ${exampleCount}/${operationCount} (${pct(exampleCount)}%)`);

    if (problems.length > 0) {
      console.error(`\nOpenAPI documentation INCOMPLETE (${problems.length} issue(s)):`);
      problems.forEach((p) => console.error(`  - ${p}`));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(`OpenAPI spec INVALID: ${err.message}`);
    process.exit(1);
  });