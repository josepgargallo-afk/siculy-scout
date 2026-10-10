import type { Contact } from './types';

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

