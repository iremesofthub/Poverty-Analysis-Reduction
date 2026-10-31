import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import ChoroplethMap from "@/components/map/ChoroplethMap";
import MapLegend from "@/components/map/MapLegend";
import DistrictDetail from "@/components/map/DistrictDetail";
import PriorityList from "@/components/map/PriorityList";
import SectorPanel, { SectorLegend } from "@/components/map/SectorPanel";
import { buildSectorSamples } from "@/data/sectorSamples";
import { BENEFICIARIES } from "@/data/programme";
import { leaderScope, useCooperatives } from "@/lib/cooperatives";
import { useProgrammeScope } from "@/lib/programmeScope";
import InfoTip from "@/components/analyst/support/InfoTip";
import PanelGuide from "@/components/analyst/PanelGuide";
import { DASHBOARD_DISTRICTS, DASHBOARD_SOURCES, NATIONAL_EICV7 } from "@/data/dashboardEvidence";
import { LAYER_KEYS, MAP_LAYERS } from "@/lib/mapLayers";
import { useDemoAuth, useRole } from "@/lib/DemoAuthContext";
import { useAuth } from "@/lib/AuthContext";
import { districtAllowed, mapScope, scopeDistrictGeo, scopeDistrictRows, scopeSectorFeatures } from "@/lib/geoScope";
import { useTranslation } from "react-i18next";

const CAN_INVESTIGATE = ["platform_admin", "nisr_analyst"];
const SELECTED_KEY = "district-map-selected";

const readSaved = (key, fallback) => {
  try { return sessionStorage.getItem(key) || fallback; } catch { return fallback; }
};

export default function FinancialMap() {
  const { t } = useTranslation();
  const role = useRole();
  const { demoUser } = useDemoAuth();
  const { profile } = useAuth();
  const [geo, setGeo] = useState(null);
  const [geoError, setGeoError] = useState(false);
  const [layer, setLayer] = useState("poverty");
  const [sectorGeo, setSectorGeo] = useState(null);
  const [sectorStatus, setSectorStatus] = useState("idle");
  const [sector, setSector] = useState(null);
  const coopState = useCooperatives();
  const programmeScope = useProgrammeScope();
  const rowsByName = useMemo(() => Object.fromEntries(DASHBOARD_DISTRICTS.map((row) => [row.name, row])), []);
  // A district, sector or cell leader starts on their own district. Everyone else keeps their last choice.
  const area = leaderScope(demoUser, profile);
  const isLeader = ["gov_district", "gov_sector", "gov_cell"].includes(role);
  const scope = useMemo(() => mapScope(role, area), [role, area.district, area.sector]); // eslint-disable-line react-hooks/exhaustive-deps
  const home = isLeader ? (DASHBOARD_DISTRICTS.find((row) => row.name === area.district)?.name || DASHBOARD_DISTRICTS.find((row) => (demoUser?.scope ?? profile?.scope)?.includes(row.name))?.name || null) : null;
  const [selected, setSelectedState] = useState(() => {
    const saved = readSaved(SELECTED_KEY, null);
    if (!scope.all) return scope.district;
    return home || (saved && rowsByName[saved] ? saved : null);
  });
  const setSelected = useCallback((name) => {
    setSelectedState(name);
    try { if (name) sessionStorage.setItem(SELECTED_KEY, name); else sessionStorage.removeItem(SELECTED_KEY); } catch { /* Selection still works without storage. */ }
  }, []);

  // Choosing a district also chooses nothing inside it yet.
  // A scoped user can never leave their own district, and cannot pick another one.
  const selectDistrict = useCallback((name) => {
    if (!scope.all) { if (name && !districtAllowed(scope, name)) return; setSector(null); setSelected(scope.district); return; }
    setSector(null); setSelected(name);
  }, [setSelected, scope]);
  const scopedGeo = useMemo(() => scopeDistrictGeo(geo, scope), [geo, scope]);
  const scopedSectorGeo = useMemo(() => (sectorGeo && !scope.all ? { ...sectorGeo, features: scopeSectorFeatures(sectorGeo.features, scope) } : sectorGeo), [sectorGeo, scope]);
  const scopedRows = useMemo(() => scopeDistrictRows(DASHBOARD_DISTRICTS, scope), [scope]);

  // The sector outlines are only needed once a district is in focus, so they load then.
  useEffect(() => {
    if (!selected || sectorGeo || sectorStatus === "loading") return;
    setSectorStatus("loading");
    fetch("/geo/rwanda-sectors.json")
      .then((response) => { if (!response.ok) throw new Error("Sector outlines could not be loaded"); return response.json(); })
      .then((data) => { setSectorGeo(data); setSectorStatus("ready"); })
      .catch(() => setSectorStatus("error"));
  }, [selected, sectorGeo, sectorStatus]);

  // Sample programme records are operational data, so each role sees only its own share of them.
  const records = useMemo(() => {
    if (role === "programme_owner") return programmeScope.beneficiaries;
    if (role === "platform_admin" || role === "nisr_analyst") return BENEFICIARIES;
    // A leader sees the beneficiaries of their own area only: the whole district, or just their sector.
    if (isLeader && home) return BENEFICIARIES.filter((item) => item.district === home && (!area.sector || item.sector === area.sector));
    return [];
  }, [role, home, isLeader, area.sector, programmeScope.beneficiaries]);
  const sectorIndex = useMemo(() => (sectorGeo ? buildSectorSamples({ geo: scopedSectorGeo, beneficiaries: records, coopState }) : null), [sectorGeo, scopedSectorGeo, records, coopState]);

  const loadGeo = useCallback(() => {
    setGeoError(false);
    setGeo(null);
    fetch("/geo/rwanda-districts.json")
      .then((response) => { if (!response.ok) throw new Error("Map boundaries could not be loaded"); return response.json(); })
      .then(setGeo)
      .catch(() => setGeoError(true));
  }, []);
  useEffect(() => { loadGeo(); }, [loadGeo]);

  const config = MAP_LAYERS[layer];
  const district = (districtAllowed(scope, selected) && rowsByName[selected]) || null;
  const onLayerKey = (event) => {
    const index = LAYER_KEYS.indexOf(layer);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const key = LAYER_KEYS[(next + LAYER_KEYS.length) % LAYER_KEYS.length];
    setLayer(key);
    requestAnimationFrame(() => document.getElementById(`map-layer-${key}`)?.focus());
  };

  return (
    <div className="pb-14">
      <PageHeader
        title={t("pageTitles.districtMap")}
        badge={
          <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-pos" />
            Latest data: 2023/24
          </span>
        }
      />

      <PanelGuide id="district-map-v2" title="District Map">
        Pick a number to colour the map, then click a district to see its figures. Press Take a tour for a short walk through the page.
      </PanelGuide>

      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight text-ink">Where Is Help Needed?</h2>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-sub">{config.label}{config.unit && ` · ${config.unit}`}<InfoTip label={config.label}>{config.help}</InfoTip></p>
          </div>
          <div role="radiogroup" aria-label="Map layer" data-tour="map-layers" onKeyDown={onLayerKey} className="flex max-w-full overflow-x-auto rounded-md bg-[#F1F4F9] p-0.5">
            {LAYER_KEYS.map((key) => (
              <button key={key} id={`map-layer-${key}`} type="button" role="radio" aria-checked={layer === key} tabIndex={layer === key ? 0 : -1} onClick={() => setLayer(key)}
                className={`shrink-0 whitespace-nowrap rounded px-2.5 py-1.5 text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand ${layer === key ? "bg-white text-ink shadow-sm" : "text-sub hover:text-ink"}`}>
                {MAP_LAYERS[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div data-tour="map-canvas" className="relative isolate h-[380px] overflow-hidden rounded-xl border border-hairline bg-white sm:h-[560px] xl:sticky xl:top-[72px] xl:col-span-2 xl:h-[calc(100vh-96px)] xl:min-h-[480px] xl:self-start">
            {geoError ? (
              <div role="alert" className="grid h-full place-items-center px-6 text-center">
                <div>
                  <p className="text-[13px] font-medium text-ink">The map could not be loaded.</p>
                  <p className="mt-1 text-[12px] text-sub">Check your connection and try again. The district list still works.</p>
                  <button type="button" onClick={loadGeo} className="mt-3 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#524BE0]">Try again</button>
                </div>
              </div>
            ) : geo ? (
              <ChoroplethMap geo={scopedGeo} locked={!scope.all} layer={layer} selected={selected} onSelect={selectDistrict} rowsByName={rowsByName} sectorGeo={scopedSectorGeo} sectorStatus={sectorStatus} sector={sector} onSelectSector={setSector} sectorIndex={sectorIndex} />
            ) : (
              <div role="status" className="grid h-full place-items-center text-[12px] text-sub">Loading boundaries…</div>
            )}
            {geo && !geoError && (selected && sectorGeo ? <SectorLegend max={Math.max(1, ...scopedSectorGeo.features.filter((feature) => feature.properties.district === selected).map((feature) => sectorIndex?.byKey.get(`${selected}|${feature.properties.shapeName}`)?.enrolled || 0))} /> : <MapLegend layer={layer} />)}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <DistrictDetail district={district} national={NATIONAL_EICV7} canInvestigate={CAN_INVESTIGATE.includes(role)} onClear={() => selectDistrict(null)} />
            {selected && <SectorPanel district={selected} sectorGeo={scopedSectorGeo} status={sectorStatus} index={sectorIndex} sector={sector} onSelectSector={setSector} />}
            <PriorityList rows={scopedRows} national={NATIONAL_EICV7} layer={layer} selected={selected} onSelect={selectDistrict} />
          </div>
        </div>

        <p className="mt-5 text-[10.5px] leading-relaxed text-[#8A94A6]">
          Boundaries: geoBoundaries ADM2 (30 districts) and ADM3 (416 sectors, CC BY 4.0). Data: <a href={DASHBOARD_SOURCES.poverty} target="_blank" rel="noreferrer" className="underline underline-offset-2">NISR EICV7</a>, 2023/24. Poverty counts people; VUP participation counts surveyed poor households, so the two cannot be subtracted. District rates carry design-based 95% intervals calculated by this repository's survey engine and pending independent scientific review; shading alone follows the point estimate, so similar shades can still cover genuinely different districts.
        </p>
      </div>
    </div>
  );
}
