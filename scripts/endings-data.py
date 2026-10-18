# One-off: write allowed_endings, biennial cadence, TX/AZ/DC search URLs and CA/AZ copy fixes into llc-states.json.
# Every allowed_endings row below was read on the official statute or SOS page on 2026-10-18.
import json, sys
LLC = ["Limited Liability Company", "LLC", "L.L.C."]
LC  = ["Limited Company", "LC", "L.C."]
def ltdco(phrases):
    out = []
    for p in phrases:
        if " " not in p: continue
        w = p.split(" ")
        for a in ([w[0], "Ltd."] if w[0] == "Limited" else [w[0]]):
            for b in ([w[-1], "Co."] if w[-1] == "Company" else [w[-1]]):
                out.append(" ".join([a] + w[1:-1] + [b]))
    return out
def E(base, abbrev=False, extra=()):
    s = list(base) + (ltdco([b for b in base if " " in b]) if abbrev else []) + list(extra)
    seen, out = set(), []
    for x in s:
        if x not in seen: seen.add(x); out.append(x)
    return out
V = {
 "AZ": (E(LLC+LC), "A.R.S. 29-3112(A)", "https://www.azleg.gov/ars/29/03112.htm"),
 "CA": (E(LLC, True), "Cal. Code Regs. tit. 2, 21000(c)(2) (SOS Business Entity Names guidelines)", "https://bpd.cdn.sos.ca.gov/be/forms/name-guidelines-restrictions-2022.pdf"),
 "CO": (E(LLC, False, ["Ltd. Liability Company", "Limited Liability Co.", "Ltd. Liability Co.", "Limited", "Ltd."]), "C.R.S. 7-90-601(3)(c)", "https://leg.colorado.gov/sites/default/files/images/olls/crs2023-title-07.pdf"),
 "DC": (E(LLC+LC, True), "D.C. Code 29-103.02(f)", "https://code.dccouncil.gov/us/dc/council/code/sections/29-103.02"),
 "DE": (E(LLC), "6 Del. C. 18-102(1)", "https://delcode.delaware.gov/title6/c018/sc01/index.html"),
 "FL": (E(LLC), "Fla. Stat. 605.0112(1)(a)", "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.0112.html"),
 "IA": (E(LLC+LC, True), "Iowa Code 489.112(1)", "https://www.legis.iowa.gov/docs/code/489.112.pdf"),
 "ID": (E(LLC+LC, True), "Idaho Code 30-21-302(d)", "https://legislature.idaho.gov/statutesrules/idstat/title30/t30ch21/sect30-21-302/"),
 "MA": (E(LLC+LC), "M.G.L. c. 156C, 3(1)", "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXII/Chapter156C/Section3"),
 "ME": (E(LLC+LC, True), "31 M.R.S. 1508(1)", "https://legislature.maine.gov/statutes/31/title31sec1508.html"),
 "MI": (E(["Limited Liability Company", "L.L.C.", "LLC", "L.C.", "LC"]), "MCL 450.4204(1) (with or without periods)", "https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-450-4204"),
 "MN": (E(["Limited Liability Company", "LLC"]), "Minn. Stat. 322C.0108, subd. 1(2)", "https://www.revisor.mn.gov/statutes/cite/322C.0108"),
 "MO": (E(LLC+LC), "RSMo 347.020(1)", "https://revisor.mo.gov/main/OneSection.aspx?section=347.020"),
 "MT": (E(LLC+LC, True), "MCA 35-8-103(1)(a)", "https://archive.legmt.gov/bills/mca/title_0350/chapter_0080/part_0010/section_0030/0350-0080-0010-0030.html"),
 "NC": (E(LLC, False, ["Ltd. Liability Co.", "Limited Liability Co.", "Ltd. Liability Company"]), "N.C.G.S. 55D-20(a)(2)", "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_55D/GS_55D-20.html"),
 "ND": (E(LLC), "N.D.C.C. 10-32.1-11(1)(b)", "https://www.ndlegis.gov/cencode/t10c32-1.pdf"),
 "NE": (E(LLC+LC, True), "Neb. Rev. Stat. 21-108(a)", "https://nebraskalegislature.gov/laws/statutes.php?statute=21-108"),
 "NV": (E(["Limited-Liability Company"]+LLC+LC+["Limited", "Ltd."], False, ["Limited-Liability Co.", "Limited Liability Co.", "Limited Co."]), "NRS 86.171(1)", "https://www.leg.state.nv.us/NRS/NRS-086.html"),
 "NY": (E(LLC), "N.Y. LLC Law 204(a); NY DOS Articles of Organization page", "https://dos.ny.gov/articles-organization-domestic-limited-liability-company-0"),
 "OH": (E(LLC, False, ["Limited", "Ltd.", "Ltd"]), "R.C. 1706.07(A)", "https://codes.ohio.gov/ohio-revised-code/section-1706.07"),
 "OR": (E(LLC), "ORS 63.094(1)", "https://www.oregonlegislature.gov/bills_laws/ors/ors063.html"),
 "RI": (E(LLC), "R.I. Gen. Laws 7-16-9(a)(1)", "https://webserver.rilegislature.gov/Statutes/TITLE7/7-16/7-16-9.htm"),
 "SC": (E(LLC+LC, True), "S.C. Code 33-44-105(a)", "https://www.scstatehouse.gov/code/t33c044.php"),
 "SD": (E(LLC+LC, True), "SDCL 47-34A-105(a)", "https://sdlegislature.gov/Statutes/47-34A-105"),
 "TX": (E(LLC+LC), "Tex. Bus. Orgs. Code 5.056(a)", "https://statutes.capitol.texas.gov/Docs/BO/htm/BO.5.htm"),
 "VA": (E(LLC+LC), "Va. Code 13.1-1012(A)", "https://law.lis.virginia.gov/vacode/title13.1/chapter12/section13.1-1012/"),
 "VT": (E(LLC+LC, True), "11 V.S.A. 4005(a)(1)", "https://legislature.vermont.gov/statutes/section/11/025/04005"),
 "WA": (E(LLC, False, ["Limited Liability Co."]), "RCW 23.95.305(5)(a)(i)", "https://app.leg.wa.gov/RCW/default.aspx?cite=23.95.305"),
 "WI": (E(["Limited Liability Company", "Limited Company", "LLC", "LC", "L.L.C.", "L.C."], True), "Wis. Stat. 183.0112(1)", "https://docs.legis.wisconsin.gov/statutes/statutes/183/i/0112"),
 "WV": (E(LLC+LC, True), "W. Va. Code 31B-1-105(a)", "https://code.wvlegislature.gov/31B-1-105/"),
 "WY": (E(LLC+LC, False, ["Ltd. Liability Company", "Ltd. Liability Co.", "Limited Liability Co."]), "W.S. 17-29-108(a)", "https://wyoleg.gov/statutes/compress/title17.pdf"),
}
BIENNIAL = {"AK", "CA", "DC", "IN", "IA", "KS", "NE", "NY"}
for path in sys.argv[1:]:
    d = json.load(open(path))
    for s in d["states"]:
        c = s["code"]
        if c in V:
            s["allowed_endings"], s["allowed_endings_cite"], s["allowed_endings_source"] = V[c]
            s["allowed_endings_verified"] = True
        else:
            s["allowed_endings"] = list(LLC)
            s["allowed_endings_cite"] = ""
            s["allowed_endings_source"] = ""
            s["allowed_endings_verified"] = False
        s["designators_allowed"] = s["allowed_endings"]
        s["restricted_words_scope"] = "common"  # the shared 14-word list; per-state lists not verified yet
        if c in BIENNIAL:
            s["annual_report_every_years"] = 2
            s["typical_yearly_cost_usd"] = round((s.get("min_annual_tax_usd") or 0) + (s["annual_report_fee_usd"] or 0) / 2, 2)
        else:
            s["annual_report_every_years"] = 1 if (s.get("annual_report_fee_usd") or 0) > 0 else s.get("annual_report_every_years", 1)
        if c == "TX":
            s["search_url"] = "https://www.sos.state.tx.us/corp/sosda/index.shtml"
            s["registry_note"] = "SOSDirect is the Texas SOS business search. It charges $1 per search."
        if c == "AZ":
            s["search_url"] = "https://arizonabusinesscenter.azcc.gov/nameavailability"
            s["publication_status"] = "Required unless waived"
        if c == "DC":
            s["search_url"] = "https://boss.dc.gov/homepage/business-license-search"
        if c == "CA":
            s["annual_report_due"] = "Statement of Information within 90 days of formation, then every 2 years"
    d["updated"] = "2026-10-18"
    json.dump(d, open(path, "w"), indent=2, ensure_ascii=False); open(path, "a").write("\n")
    print("wrote", path, sum(1 for s in d["states"] if s["allowed_endings_verified"]), "verified endings")
