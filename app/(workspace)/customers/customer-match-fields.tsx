"use client";
import { useState } from "react";
import Link from "next/link";
import { normalizeCustomerName } from "@/lib/pos/safeguards";
export function CustomerMatchFields({ customers }: { customers: { id: string; name: string; email: string | null; phoneNumber: string | null }[] }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const matches = customers.filter(c => (name.trim() && normalizeCustomerName(c.name) === normalizeCustomerName(name)) || (email.trim() && c.email?.toLowerCase() === email.trim().toLowerCase()) || (phone.replace(/\D/g, "") && c.phoneNumber?.replace(/\D/g, "") === phone.replace(/\D/g, "")));
  const cls = "h-10 rounded-lg border border-border bg-background px-3 text-xs";
  return <><label className="grid gap-1.5 text-xs">Name<input name="name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} className={cls} /></label>
    <label className="grid gap-1.5 text-xs">Email<input name="email" type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className={cls} /></label>
    <label className="grid gap-1.5 text-xs">Phone number<input name="phoneNumber" maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} className={cls} /></label>
    {matches.length > 0 && <div role="status" className="grid gap-2 rounded-lg border border-chart-1 p-3 text-xs sm:col-span-2 xl:col-span-3"><p>Possible existing customer. Open the account before creating another.</p>{matches.map(c => <Link key={c.id} href={`/customers/${c.id}`} className="underline">{c.name} · {c.id.slice(0,8)}</Link>)}<label className="flex gap-2"><input name="distinctCustomer" type="checkbox" required />These are different people; create a separate account.</label><label className="grid gap-1">Why is a separate account needed?<input name="duplicateReason" required minLength={5} maxLength={500} className={cls} /></label></div>}
  </>;
}
