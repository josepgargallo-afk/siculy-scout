import { Field } from './kit';

export { emptyContact, fromContact, toContactPatch, type ContactFields } from '../lib/contactFields';
import type { ContactFields } from '../lib/contactFields';

/** Chips con valores alternativos detectados por el OCR: un toque los pone en el campo. */
export function Alts({ values, current, onPick }: { values?: string[]; current: string; onPick: (v: string) => void }) {
  const list = (values ?? []).filter((v) => v && v !== current);
  if (!list.length) return null;
  return (
    <div className="alts" aria-label="Alternativas detectadas">
      {list.map((v) => <button key={v} type="button" className="chip alt" onClick={() => onPick(v)}>{v}</button>)}
    </div>
  );
}

/** Campos del contacto. `flag` marca campos de baja certeza (OCR) para revisión; `alts` ofrece alternativas. */
export function ContactFieldsForm({ value, onChange, flag = [], alts = {} }: {
  value: ContactFields; onChange: (p: Partial<ContactFields>) => void; flag?: string[]; alts?: Partial<Record<keyof ContactFields, string[]>>;
}) {
  const w = (k: keyof ContactFields) => (flag.includes(k) ? 'uncertain' : '');
  const mark = (k: keyof ContactFields) => (flag.includes(k) ? ' ⚠ revisar' : '');
  const A = (k: keyof ContactFields) => <Alts values={alts[k]} current={value[k]} onPick={(v) => onChange({ [k]: v })} />;
  return (
    <div className="stack">
      <div className={w('fullName')}><Field label={'Nombre completo' + mark('fullName')}><input type="text" autoCapitalize="words" value={value.fullName} onChange={(e) => onChange({ fullName: e.target.value })} /></Field>{A('fullName')}</div>
      <div className="grid2">
        <div className={w('role')}><Field label={'Cargo' + mark('role')}><input type="text" value={value.role} onChange={(e) => onChange({ role: e.target.value })} /></Field>{A('role')}</div>
        <Field label="Departamento"><input type="text" value={value.department} onChange={(e) => onChange({ department: e.target.value })} /></Field>
      </div>
      <div className={w('email')}><Field label={'Email' + mark('email')}><input type="email" inputMode="email" autoCapitalize="none" value={value.email} onChange={(e) => onChange({ email: e.target.value })} /></Field>{A('email')}</div>
      <div className="grid2">
        <div className={w('phone')}><Field label={'Teléfono' + mark('phone')}><input type="tel" value={value.phone} onChange={(e) => onChange({ phone: e.target.value })} /></Field>{A('phone')}</div>
        <div className={w('mobile')}><Field label={'Móvil / WhatsApp' + mark('mobile')}><input type="tel" value={value.mobile} onChange={(e) => onChange({ mobile: e.target.value })} /></Field>{A('mobile')}</div>
      </div>
      <div className={w('webOrLinkedin')}><Field label={'Web o LinkedIn' + mark('webOrLinkedin')}><input type="text" inputMode="url" autoCapitalize="none" value={value.webOrLinkedin} onChange={(e) => onChange({ webOrLinkedin: e.target.value })} /></Field>{A('webOrLinkedin')}</div>
      <Field label="Notas"><textarea value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} /></Field>
    </div>
  );
}
