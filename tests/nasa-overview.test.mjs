import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the production handler with deterministic upstream responses.
const source = readFileSync(new URL('../app/api/nasa/overview/route.ts', import.meta.url), 'utf8')
  .replace("import { NextRequest, NextResponse } from 'next/server';", 'const NextResponse = { json: (body, init) => Response.json(body, init) };');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

it('loads soil through AG, preserves zero and missing values, and labels the source', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const scenario of ['wetness', 'volumetric', 'missing']) {
      const calls = [];
      globalThis.fetch = async url => {
        const params = new URL(url).searchParams;
        calls.push(params);
        if (params.get('community') !== 'AG') return Response.json({ messages: ['Invalid community'] }, { status: 422 });
        const parameters = {};
        const today = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
        for (const key of params.get('parameters').split(',')) {
          parameters[key] = { [today]: key === 'GWETTOP' ? (scenario === 'wetness' ? 0 : -999) : key === 'SFMC' ? (scenario === 'volumetric' ? 0.2 : -999) : 12 };
        }
        return Response.json({ properties: { parameter: parameters } });
      };
      const response = await GET({ nextUrl: new URL('http://localhost/api/nasa/overview?lat=41.9981&lng=21.4254') });
      const result = await response.json();
      assert.equal(response.status, 200);
      assert.ok(calls.every(params => params.get('community') === 'AG'));
      assert.equal(result.soilSource, scenario === 'wetness' ? 'GWETTOP' : scenario === 'volumetric' ? 'SFMC' : null);
      assert.equal(result.soilWetness.value, scenario === 'wetness' ? 0 : scenario === 'volumetric' ? 20 : null);
      assert.equal(result.daily.at(-1).soilWetness, result.soilWetness.value);
      assert.match(result.soilNote, scenario === 'wetness' ? /wetness fraction/ : scenario === 'volumetric' ? /volumetric/ : /No valid NASA soil observation/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
