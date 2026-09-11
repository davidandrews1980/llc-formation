export type UsState = {
  code: string;
  name: string;
  agency: string;
  fee: number;
  annualFee: number | null;
  annualName: string;
  portal: string;
  notes: string;
};

export const US_STATES: readonly UsState[] = [
  { code: "AL", name: "Alabama", agency: "Secretary of State", fee: 200, annualFee: 0, annualName: "Privilege tax / annual report", portal: "https://www.sos.alabama.gov/business-entities", notes: "County probate may also collect a filing fee." },
  { code: "AK", name: "Alaska", agency: "Division of Corporations, Business and Professional Licensing", fee: 250, annualFee: 100, annualName: "Biennial report", portal: "https://www.commerce.alaska.gov/web/cbpl/Corporations.aspx", notes: "Biennial report due in even or odd years based on formation." },
  { code: "AZ", name: "Arizona", agency: "Corporation Commission", fee: 50, annualFee: 0, annualName: "No annual report for LLCs", portal: "https://ecorp.azcc.gov", notes: "Publication of formation may be required in some counties." },
  { code: "AR", name: "Arkansas", agency: "Secretary of State", fee: 45, annualFee: 150, annualName: "Franchise tax / annual report", portal: "https://www.sos.arkansas.gov/business-commercial-services-bcs", notes: "Annual franchise tax based on capitalization." },
  { code: "CA", name: "California", agency: "Secretary of State", fee: 70, annualFee: 800, annualName: "Franchise tax (minimum)", portal: "https://bizfileonline.sos.ca.gov", notes: "$800 franchise tax is due even in year one after a short grace window. Statement of Information also required." },
  { code: "CO", name: "Colorado", agency: "Secretary of State", fee: 50, annualFee: 10, annualName: "Periodic report", portal: "https://www.sos.state.co.us", notes: "Periodic report is inexpensive; keep the registered agent current." },
  { code: "CT", name: "Connecticut", agency: "Secretary of the State", fee: 120, annualFee: 80, annualName: "Annual report", portal: "https://business.ct.gov", notes: "Online filing through Business.CT.gov." },
  { code: "DE", name: "Delaware", agency: "Division of Corporations", fee: 110, annualFee: 300, annualName: "Annual franchise tax", portal: "https://icis.corp.delaware.gov", notes: "Preferred for multi-member / investor-backed entities. Registered agent in DE is required." },
  { code: "DC", name: "District of Columbia", agency: "Department of Licensing and Consumer Protection", fee: 99, annualFee: 99, annualName: "Biennial report", portal: "https://corponline.dlcp.dc.gov", notes: "Trade name registration is separate if you operate under a DBA." },
  { code: "FL", name: "Florida", agency: "Division of Corporations", fee: 125, annualFee: 138.75, annualName: "Annual report", portal: "https://dos.fl.gov/sunbiz", notes: "Sunbiz.org is the filing portal. Annual report due May 1." },
  { code: "GA", name: "Georgia", agency: "Secretary of State", fee: 100, annualFee: 50, annualName: "Annual registration", portal: "https://ecorp.sos.ga.gov", notes: "Publication in the legal organ of the county may be required." },
  { code: "HI", name: "Hawaii", agency: "Department of Commerce and Consumer Affairs", fee: 50, annualFee: 15, annualName: "Annual report", portal: "https://hbe.ehawaii.gov", notes: "GET license is separate from entity formation." },
  { code: "ID", name: "Idaho", agency: "Secretary of State", fee: 100, annualFee: 0, annualName: "Annual report (no fee)", portal: "https://sosbiz.idaho.gov", notes: "Annual report required, currently no fee." },
  { code: "IL", name: "Illinois", agency: "Secretary of State", fee: 150, annualFee: 75, annualName: "Annual report", portal: "https://www.ilsos.gov/departments/business_services/home.html", notes: "Series LLCs are available. Registered agent must have an Illinois street address." },
  { code: "IN", name: "Indiana", agency: "Secretary of State", fee: 95, annualFee: 32, annualName: "Business entity report (biennial)", portal: "https://inbiz.in.gov", notes: "Business entity report is biennial." },
  { code: "IA", name: "Iowa", agency: "Secretary of State", fee: 50, annualFee: 45, annualName: "Biennial report", portal: "https://sos.iowa.gov/business", notes: "Biennial report due in odd-numbered years." },
  { code: "KS", name: "Kansas", agency: "Secretary of State", fee: 160, annualFee: 55, annualName: "Annual report", portal: "https://www.sos.ks.gov", notes: "Annual report plus franchise tax may apply." },
  { code: "KY", name: "Kentucky", agency: "Secretary of State", fee: 40, annualFee: 15, annualName: "Annual report", portal: "https://sos.ky.gov", notes: "One of the lowest formation fees in the country." },
  { code: "LA", name: "Louisiana", agency: "Secretary of State", fee: 100, annualFee: 35, annualName: "Annual report", portal: "https://www.sos.la.gov", notes: "Supplemental initial report may be required shortly after formation." },
  { code: "ME", name: "Maine", agency: "Secretary of State", fee: 175, annualFee: 85, annualName: "Annual report", portal: "https://www.maine.gov/sos/cec/corp", notes: "Expedited service is available for an extra fee." },
  { code: "MD", name: "Maryland", agency: "Department of Assessments and Taxation", fee: 100, annualFee: 300, annualName: "Personal property return / annual report", portal: "https://egov.maryland.gov/BusinessExpress", notes: "Personal property return is required even if you own no property." },
  { code: "MA", name: "Massachusetts", agency: "Secretary of the Commonwealth", fee: 500, annualFee: 500, annualName: "Annual report", portal: "https://www.sec.state.ma.us/cor", notes: "Highest formation fee in New England. Annual report is also $500." },
  { code: "MI", name: "Michigan", agency: "LARA — Corporations, Securities & Commercial Licensing", fee: 50, annualFee: 25, annualName: "Annual statement", portal: "https://www.michigan.gov/lara/bureau-list/cscl/corporations", notes: "File Articles of Organization (CSCL/CD-700) through Corporations Online Filing System (COFS). Resident agent with a Michigan street address is required. Annual statement due by February 15." },
  { code: "MN", name: "Minnesota", agency: "Secretary of State", fee: 155, annualFee: 0, annualName: "Annual renewal (no fee)", portal: "https://mblsportal.sos.state.mn.us", notes: "Annual renewal is required to stay in good standing." },
  { code: "MS", name: "Mississippi", agency: "Secretary of State", fee: 50, annualFee: 25, annualName: "Annual report", portal: "https://corp.sos.ms.gov", notes: "Publication is not required." },
  { code: "MO", name: "Missouri", agency: "Secretary of State", fee: 50, annualFee: 0, annualName: "No annual report for LLCs", portal: "https://www.sos.mo.gov/business", notes: "No annual report currently required for LLCs." },
  { code: "MT", name: "Montana", agency: "Secretary of State", fee: 35, annualFee: 20, annualName: "Annual report", portal: "https://sosmt.gov/business", notes: "One of the lowest formation fees." },
  { code: "NE", name: "Nebraska", agency: "Secretary of State", fee: 100, annualFee: 10, annualName: "Biennial occupation tax", portal: "https://www.nebraska.gov/sos/ccorp", notes: "Occupation tax is biennial." },
  { code: "NV", name: "Nevada", agency: "Secretary of State", fee: 425, annualFee: 350, annualName: "Annual list + business license", portal: "https://www.nvsilverflume.gov", notes: "State business license is separate from the entity filing and due each year." },
  { code: "NH", name: "New Hampshire", agency: "Secretary of State", fee: 100, annualFee: 100, annualName: "Annual report", portal: "https://quickstart.sos.nh.gov", notes: "Add a trade name if you operate under a DBA." },
  { code: "NJ", name: "New Jersey", agency: "Division of Revenue and Enterprise Services", fee: 125, annualFee: 75, annualName: "Annual report", portal: "https://www.njportal.com/DOR/BusinessFormation", notes: "Public records filing and annual report are both online." },
  { code: "NM", name: "New Mexico", agency: "Secretary of State", fee: 50, annualFee: 0, annualName: "No annual report for LLCs", portal: "https://portal.sos.state.nm.us", notes: "No annual report currently required for LLCs." },
  { code: "NY", name: "New York", agency: "Department of State", fee: 200, annualFee: 9, annualName: "Biennial statement", portal: "https://dos.ny.gov/limited-liability-companies", notes: "Within 120 days you must publish in two newspapers and file a Certificate of Publication — budget extra." },
  { code: "NC", name: "North Carolina", agency: "Secretary of State", fee: 125, annualFee: 200, annualName: "Annual report", portal: "https://www.sosnc.gov", notes: "Annual report fee is higher than formation in some years — confirm on SOSNC." },
  { code: "ND", name: "North Dakota", agency: "Secretary of State", fee: 135, annualFee: 50, annualName: "Annual report", portal: "https://firststop.sos.nd.gov", notes: "FirstStop is the online portal." },
  { code: "OH", name: "Ohio", agency: "Secretary of State", fee: 99, annualFee: 0, annualName: "No annual report for LLCs", portal: "https://www.ohiosos.gov", notes: "No annual report currently required for domestic LLCs." },
  { code: "OK", name: "Oklahoma", agency: "Secretary of State", fee: 100, annualFee: 25, annualName: "Annual certificate", portal: "https://www.sos.ok.gov", notes: "Franchise tax may also apply depending on capitalization." },
  { code: "OR", name: "Oregon", agency: "Secretary of State", fee: 100, annualFee: 100, annualName: "Annual report", portal: "https://sos.oregon.gov/business", notes: "Oregon requires an annual report to remain active." },
  { code: "PA", name: "Pennsylvania", agency: "Department of State", fee: 125, annualFee: 7, annualName: "Annual report (decoupled)", portal: "https://file.dos.pa.gov", notes: "Docketing statement is filed with the formation documents." },
  { code: "RI", name: "Rhode Island", agency: "Secretary of State", fee: 150, annualFee: 50, annualName: "Annual report", portal: "https://business.sos.ri.gov", notes: "Online filing through the RI business portal." },
  { code: "SC", name: "South Carolina", agency: "Secretary of State", fee: 110, annualFee: 0, annualName: "No annual report for LLCs", portal: "https://businessfilings.sc.gov", notes: "No annual report currently required for LLCs." },
  { code: "SD", name: "South Dakota", agency: "Secretary of State", fee: 150, annualFee: 50, annualName: "Annual report", portal: "https://sosenterprise.sd.gov", notes: "Annual report due by the anniversary month." },
  { code: "TN", name: "Tennessee", agency: "Secretary of State", fee: 300, annualFee: 300, annualName: "Annual report", portal: "https://tnbear.tn.gov", notes: "Annual report fee matches formation. File through TNBear." },
  { code: "TX", name: "Texas", agency: "Secretary of State", fee: 300, annualFee: 0, annualName: "Public Information Report / franchise tax", portal: "https://www.sos.state.tx.us/corp", notes: "No SOS annual report, but a franchise tax / PIR is filed with the Comptroller. Most small LLCs owe $0 franchise tax under the no-tax-due threshold." },
  { code: "UT", name: "Utah", agency: "Division of Corporations and Commercial Code", fee: 54, annualFee: 18, annualName: "Annual renewal", portal: "https://business.utah.gov", notes: "Low fees. Renew annually to stay active." },
  { code: "VT", name: "Vermont", agency: "Secretary of State", fee: 125, annualFee: 35, annualName: "Annual report", portal: "https://bizfilings.vermont.gov", notes: "Online filings through Vermont BizFilings." },
  { code: "VA", name: "Virginia", agency: "State Corporation Commission", fee: 100, annualFee: 50, annualName: "Annual registration fee", portal: "https://cis.scc.virginia.gov", notes: "SCC Clerk's Information System is the portal." },
  { code: "WA", name: "Washington", agency: "Secretary of State", fee: 200, annualFee: 60, annualName: "Annual report", portal: "https://ccfs.sos.wa.gov", notes: "Business license through Department of Revenue is separate." },
  { code: "WV", name: "West Virginia", agency: "Secretary of State", fee: 100, annualFee: 25, annualName: "Annual report", portal: "https://sos.wv.gov", notes: "Annual report due June 30." },
  { code: "WI", name: "Wisconsin", agency: "Department of Financial Institutions", fee: 130, annualFee: 25, annualName: "Annual report", portal: "https://www.wdfi.org", notes: "File through Wisconsin's online business filing system." },
  { code: "WY", name: "Wyoming", agency: "Secretary of State", fee: 100, annualFee: 60, annualName: "Annual report", portal: "https://wyobiz.wyo.gov", notes: "Privacy-friendly statute. Registered agent in Wyoming is required." },
];

export function stateByCode(code: string) {
  return US_STATES.find((s) => s.code === code);
}

export const NAME_ENDINGS = ["LLC", "L.L.C.", "Limited Liability Company"] as const;
