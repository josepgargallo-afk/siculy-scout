import type { Contact } from '../lib/types';
import { Field } from './kit';

export interface ContactFields {
  fullName: string; role: string; department: string; email: string; phone: string; mobile: string; webOrLinkedin: string; notes: string;
}

export const emptyContact: ContactFields = { fullName: '', role: '', department: '', email: '', phone: '', mobile: '', webOrLinkedin: '', notes: '' };

export const fromContact = (c: Contact): ContactFields => ({
  fullName: c.fullName, role: c.role ?? '', department: c.department ?? '', email: c.email ?? '', phone: c.phone ?? '',
  mobile: c.mobile ?? '', webOrLinkedin: c.webOrLinkedin ?? '', notes: c.notes ?? '',
});

export const toContactPatch = (f: ContactFields) => ({
  fullName: f.fullName.trim(), role: f.role.trim() || undefined, department: f.department.trim() || undefined,
  email: f.email.trim() || undefined, phone: f.phone.trim() || undefined, mobile: f.mobile.trim() || undefined,
  webOrLinkedin: f.webOrLinkedin.trim() || undefined, notes: f.notes.trim() || undefined,
});

/** Campos del contacto. `flag` marca campos de baja certeza (OCR) para revisión. */
export function ContactFieldsForm({ value, onChange, flag = [] }: { value: ContactFields; onChange: (p: Partial<ContactFields>) => void; flag?: string[] }) {
  const w = (k: keyof ContactFields) => (flag.includes(k) ? 'uncertain' : '');
  const mark = (k: keyof ContactFields) => (flag.includes(k) ? ' ⚠ revisar' : '');
  return (
    <div className="stack">
      <div className={w('fullName')}><Field label={'Nombre completo' + mark('fullName')}><input type="text" autoCapitalize="words" value={value.fullName} onChange={(e) => onChange({ fullName: e.target.value })} /></Field></div>
      <div className="grid2">
        <div className={w('role')}><Field label={'Cargo' + mark('role')}><input type="text" value={value.role} onChange={(e) => onChange({ role: e.target.value })} /></Field></div>
        <Field label="Departamento"><input type="text" value={value.department} onChange={(e) => onChange({ department: e.target.value })} /></Field>
      </div>
      <Field label="Email"><input type="email" inputMode="email" autoCapitalize="none" value={value.email} onChange={(e) => onChange({ email: e.target.value })} /></Field>
      <div className="grid2">
        <div className={w('phone')}><Field label={'Teléfono' + mark('phone')}><input type="tel" value={value.phone} onChange={(e) => onChange({ phone: e.target.value })} /></Field></div>
        <div className={w('mobile')}><Field label={'Móvil / WhatsApp' + mark('mobile')}><input type="tel" value={value.mobile} onChange={(e) => onChange({ mobile: e.target.value })} /></Field></div>
      </div>
      <Field label="Web o LinkedIn"><input type="text" inputMode="url" autoCapitalize="none" value={value.webOrLinkedin} onChange={(e) => onChange({ webOrLinkedin: e.target.value })} /></Field>
      <Field label="Notas"><textarea value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} /></Field>
    </div>
  );
}
