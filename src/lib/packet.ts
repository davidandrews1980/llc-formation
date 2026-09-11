import type { Filing } from "@/lib/server/llc";
import { stateByCode } from "@/lib/states";

export function legalName(f: Filing) {
  const base = f.entityName.trim() || "[Name]";
  const ending = f.nameEnding || "LLC";
  if (base.toLowerCase().endsWith("llc") || base.toLowerCase().includes("limited liability")) {
    return base;
  }
  return `${base} ${ending}`;
}

export function fullAddress(
  street: string,
  city: string,
  state: string,
  zip: string,
) {
  const line = [street, [city, state].filter(Boolean).join(", "), zip]
    .filter(Boolean)
    .join(", ");
  return line || "[address]";
}

export function articlesText(f: Filing) {
  const st = stateByCode(f.stateCode);
  const name = legalName(f);
  const members = f.members.filter((m) => m.name.trim());
  const mgmt =
    f.management === "manager"
      ? "The Company shall be managed by one or more managers."
      : "The Company shall be managed by its members.";
  return [
    `ARTICLES OF ORGANIZATION`,
    ``,
    `of`,
    ``,
    name.toUpperCase(),
    ``,
    `A Limited Liability Company`,
    ``,
    `The undersigned organizer submits these Articles of Organization for the purpose of forming a limited liability company under the laws of the ${st?.name ?? f.stateCode}.`,
    ``,
    `Article I. Name. The name of the limited liability company is ${name}.`,
    ``,
    `Article II. Purpose. The purpose of the Company is ${f.purpose.trim() || "to engage in any lawful act or activity for which limited liability companies may be organized in this state"}.`,
    ``,
    `Article III. Principal Office. The street address of the principal office is ${fullAddress(f.principalStreet, f.principalCity, f.principalState || f.stateCode, f.principalZip)}.`,
    ``,
    `Article IV. Registered Agent. The name of the registered / resident agent is ${f.agentName.trim() || "[agent name]"}. The agent's street address in ${st?.name ?? f.stateCode} is ${fullAddress(f.agentStreet, f.agentCity, f.agentState || f.stateCode, f.agentZip)}.`,
    ``,
    `Article V. Management. ${mgmt}`,
    ``,
    `Article VI. Duration. The period of duration is ${f.duration === "perpetual" ? "perpetual" : f.duration}.`,
    ``,
    `Article VII. Effective Date. These Articles shall be effective ${f.effective === "upon_filing" ? "upon filing by the filing office" : f.effective}.`,
    ``,
    members.length
      ? `Article VIII. Initial Members. The initial member(s): ${members.map((m) => `${m.name} (${m.ownership}%)`).join("; ")}.`
      : `Article VIII. Initial Members. Initial members shall be as set forth in the operating agreement.`,
    ``,
    `Article IX. Organizer. The name and email of the organizer is ${f.organizerName.trim() || "[organizer]"} ${f.organizerEmail ? `<${f.organizerEmail}>` : ""}.`,
    ``,
    `The undersigned affirms that the facts stated herein are true to the best of the organizer's knowledge and that this document is submitted in accordance with the applicable limited liability company act of ${st?.name ?? f.stateCode}.`,
    ``,
    `Dated: ____________________`,
    ``,
    `Organizer: ${f.organizerName.trim() || "____________________"}`,
    ``,
    `Signature: ____________________`,
  ].join("\n");
}

export function operatingAgreementText(f: Filing) {
  const name = legalName(f);
  const st = stateByCode(f.stateCode);
  const members = f.members.filter((m) => m.name.trim());
  const memberLines =
    members.length > 0
      ? members
          .map(
            (m, i) =>
              `  ${i + 1}. ${m.name}, ${m.title || "Member"}, ${m.ownership}% — ${m.address || "address on file"}`,
          )
          .join("\n")
      : "  (members to be listed on Schedule A)";
  const mgmt =
    f.management === "manager"
      ? "The Company is manager-managed. Members do not have apparent authority to bind the Company merely by being members. Managers may bind the Company in the ordinary course."
      : "The Company is member-managed. Each member is an agent of the Company for carrying on its ordinary business, except as limited in writing.";
  const extra = f.packetNotes.trim();
  return [
    `OPERATING AGREEMENT`,
    `of ${name}`,
    ``,
    `This Operating Agreement is entered into by the members of ${name}, a ${st?.name ?? f.stateCode} limited liability company (the "Company").`,
    ``,
    `1. Formation. The Company is formed by filing Articles of Organization with the ${st?.agency ?? "state filing office"}. This Agreement governs the Company as of the effective date of that filing.`,
    ``,
    `2. Name and Office. The Company shall do business as ${name}. The principal office is ${fullAddress(f.principalStreet, f.principalCity, f.principalState || f.stateCode, f.principalZip)}.`,
    ``,
    `3. Purpose. ${f.purpose.trim() || "Any lawful business."}`,
    ``,
    `4. Members and Units.`,
    memberLines,
    `Ownership percentages above are the initial membership interests. Additional members require written consent of members holding a majority of interests, unless a different threshold is later adopted in writing.`,
    ``,
    `5. Management. ${mgmt}`,
    ``,
    `6. Capital. Initial capital contributions are as agreed among the members and recorded in the Company's books. No member is required to make additional contributions unless they agree in writing.`,
    ``,
    `7. Distributions. Distributable cash may be distributed in proportion to membership interests at such times as the members (or managers, if manager-managed) determine, after retaining reasonable reserves.`,
    ``,
    `8. Transfers. A member may not transfer an interest that confers management rights without prior written consent of the other members. An unapproved transferee is an assignee of economic rights only.`,
    ``,
    `9. Books and Records. The Company shall keep ordinary books at the principal office. Members may inspect them on reasonable notice. The tax year is the calendar year unless the members elect otherwise.`,
    ``,
    `10. Dissolution. The Company dissolves upon the vote of members holding a majority of interests, or as required by law. Remaining assets, after debts, are distributed in proportion to membership interests.`,
    ``,
    `11. Governing Law. This Agreement is governed by the laws of ${st?.name ?? f.stateCode}, without regard to conflict-of-law rules.`,
    ``,
    `12. Entire Agreement. This Agreement, the Articles, and any written schedules are the entire agreement of the members. Amendments must be in writing and signed by members holding a majority of interests.`,
    ``,
    extra ? `Addendum — drafted language\n\n${extra}\n` : "",
    `THIS DOCUMENT IS A WORKING DRAFT. It is not legal advice and is not a substitute for a lawyer licensed in ${st?.name ?? "this state"}. Confirm every requirement with the filing office before you file.`,
    ``,
    members
      .map(
        (m) =>
          `Member: ${m.name}\nSignature: ____________________    Date: __________`,
      )
      .join("\n\n") ||
      `Member: ____________________\nSignature: ____________________    Date: __________`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export function einChecklist(f: Filing) {
  const name = legalName(f);
  return [
    `EIN CHECKLIST — IRS Form SS-4`,
    ``,
    `Apply free at https://www.irs.gov/ein (never pay a third-party "EIN filing" mill).`,
    ``,
    `Legal name: ${name}`,
    `Trade name / DBA: (only if different)`,
    `State of formation: ${f.stateCode}`,
    `Responsible party: ${f.organizerName || "[name of responsible party]"}`,
    `Mailing address: ${fullAddress(f.principalStreet, f.principalCity, f.principalState || f.stateCode, f.principalZip)}`,
    `Entity type: Limited liability company`,
    `Members: ${f.members.filter((m) => m.name.trim()).length || 1} (single-member LLCs are usually disregarded; multi-member LLCs are usually partnerships unless an S-corp election is filed later)`,
    `Reason: Started a new business`,
    ``,
    `After you receive the CP 575 EIN letter:`,
    `1. Keep the letter with the formation packet.`,
    `2. Open a business bank account in the LLC name. Do not commingle.`,
    `3. If you will have employees, register for state withholding and unemployment.`,
    `4. Collect sales tax only if you sell taxable goods/services in that state.`,
  ].join("\n");
}

export function filingInstructions(f: Filing) {
  const st = stateByCode(f.stateCode);
  const name = legalName(f);
  if (!st) return "Choose a state first.";
  const annual =
    st.annualFee === 0 || st.annualFee === null
      ? st.annualName
      : `${st.annualName} (about $${st.annualFee})`;
  return [
    `FILING INSTRUCTIONS — ${st.name}`,
    ``,
    `Entity: ${name}`,
    `Filing office: ${st.agency}`,
    `Portal: ${st.portal}`,
    `Typical articles fee: $${st.fee} (confirm on the portal; fees change)`,
    `Ongoing: ${annual}`,
    ``,
    `Do this in order:`,
    `1. Search the state name database on the portal. Do not file a name that is not distinguishable.`,
    `2. Confirm the registered / resident agent has a physical street address in ${st.name} and has agreed to serve.`,
    `3. File the Articles of Organization from this packet (or the state's own form if the portal requires it). Pay the fee.`,
    `4. Save the stamped / filed copy the state emails or mails back. That is your formation evidence.`,
    `5. Sign the operating agreement the same day. Even a single-member LLC should have one.`,
    `6. Get an EIN from IRS.gov.`,
    `7. Open the bank account with the filed articles + EIN letter + operating agreement + ID.`,
    `8. Calendar the annual / biennial obligation: ${st.annualName}.`,
    ``,
    `State note: ${st.notes}`,
    ``,
    `This product prepares documents and a checklist. It does not file with the state, does not create the LLC by itself, and is not a law firm.`,
  ].join("\n");
}

export function complianceCalendar(f: Filing) {
  const st = stateByCode(f.stateCode);
  return [
    `FIRST-YEAR COMPLIANCE`,
    ``,
    `☐ File Articles of Organization with ${st?.agency ?? "the state"}`,
    `☐ Signed operating agreement in the records book`,
    `☐ EIN (IRS SS-4)`,
    `☐ Business bank account in the LLC name`,
    `☐ State tax / sales-tax accounts if you will have nexus or taxable sales`,
    `☐ Local business license if the city or county requires one`,
    `☐ ${st?.annualName ?? "Annual report"} — ${st?.annualFee ? `about $${st.annualFee}` : "see portal"}`,
    `☐ Keep the registered agent current. A lapsed agent is how companies get administratively dissolved.`,
    `☐ Separate personal and company money. Piercing the veil starts with commingling.`,
  ].join("\n");
}
