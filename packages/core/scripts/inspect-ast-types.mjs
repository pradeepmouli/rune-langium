import { collectAst } from 'langium/grammar';
import { RuneDslGrammar } from '../src/generated/grammar.js';

const grammar = RuneDslGrammar();
const astTypes = collectAst([grammar]);

const ifaceNames = new Set(astTypes.interfaces.map((i) => i.name));
const unionNames = new Set(astTypes.unions.map((u) => u.name));
const allKnownTypes = new Set([...ifaceNames, ...unionNames]);

const unresolvedPropTypes = new Map();
for (const iface of astTypes.interfaces) {
  for (const prop of iface.properties ?? []) {
    const t = prop.type;
    const typeName =
      typeof t === 'string' ? t : t && typeof t === 'object' && 'name' in t ? String(t.name) : null;
    if (typeName && !allKnownTypes.has(typeName)) {
      unresolvedPropTypes.set(typeName, (unresolvedPropTypes.get(typeName) ?? 0) + 1);
    }
  }
}

console.log('Interfaces:', astTypes.interfaces.length);
console.log('Unions:', astTypes.unions.length);
console.log(
  'Unresolved property types (datatype rules etc.):',
  Object.fromEntries(unresolvedPropTypes)
);
// Print a sample property to see its shape
const annotation = astTypes.interfaces.find((i) => i.name === 'Annotation');
if (annotation) {
  const nameProp = annotation.properties?.find((p) => p.name === 'name');
  console.log('Annotation.name prop:', JSON.stringify(nameProp, null, 2));
}
