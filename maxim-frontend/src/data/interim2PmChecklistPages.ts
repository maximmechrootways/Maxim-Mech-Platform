export type Interim2PmPageConfig = {
  pageNum: number
  title: string
  columns: string[]
  rows: Array<[component: string, tag: string, refDwg: string]>
}

function buildRows(
  rows: Array<[string, string, string]>,
  columnCount: number
): string[][] {
  return rows.map(([component, tag, refDwg]) => {
    const row = Array.from({ length: columnCount }, () => '')
    row[0] = component
    row[1] = tag
    row[2] = refDwg
    return row
  })
}

export function getInterim2PmPageConfig(pageNum: number): Interim2PmPageConfig | undefined {
  return INTERIM2_PM_PAGES.find((p) => p.pageNum === pageNum)
}

export function getInterim2PmMatrixDefaults(pageNum: number): { columns: string[]; rows: string[][] } | null {
  const page = getInterim2PmPageConfig(pageNum)
  if (!page) return null
  return {
    columns: [...page.columns],
    rows: buildRows(page.rows, page.columns.length),
  }
}

export function parseInterim2PmMatrixState(
  raw: string | undefined,
  pageNum: number
): { columns: string[]; rows: string[][] } {
  const defaults = getInterim2PmMatrixDefaults(pageNum)
  if (!defaults) return { columns: [], rows: [] }

  const mergeRows = (savedRows: string[][] | undefined): string[][] => {
    const baselineRows = defaults.rows
    if (!savedRows?.length) {
      return baselineRows.map((row) => [...row])
    }

    const mergedBaseline = baselineRows.map((baseline, rowIdx) => {
      const saved = savedRows[rowIdx]
      if (!Array.isArray(saved)) return [...baseline]
      return defaults.columns.map((_, colIdx) => {
        if (colIdx <= 2) return baseline[colIdx] ?? ''
        return String(saved[colIdx] ?? '')
      })
    })

    const extraRows = savedRows.slice(baselineRows.length).map((saved) => {
      const cells = Array.isArray(saved) ? saved.map((cell) => String(cell ?? '')) : []
      while (cells.length < defaults.columns.length) cells.push('')
      return cells.slice(0, defaults.columns.length)
    })

    return [...mergedBaseline, ...extraRows]
  }

  if (!raw?.trim()) {
    return {
      columns: [...defaults.columns],
      rows: mergeRows(undefined),
    }
  }

  try {
    const parsed = JSON.parse(raw) as { columns?: string[]; rows?: string[][] }
    return {
      columns: [...defaults.columns],
      rows: mergeRows(Array.isArray(parsed.rows) ? parsed.rows : undefined),
    }
  } catch {
    return {
      columns: [...defaults.columns],
      rows: mergeRows(undefined),
    }
  }
}

export function getInterim2PmDefaultRowCount(pageNum: number): number {
  return getInterim2PmPageConfig(pageNum)?.rows.length ?? 0
}

export function parseInterim2PmPageNumFromMatrixLabel(label?: string): number | null {
  const match = String(label ?? '').match(/interim\s*2\s*pm\s*matrix\s*[—-]\s*page\s*(\d+)/i)
  if (!match) return null
  const pageNum = Number(match[1])
  return Number.isFinite(pageNum) ? pageNum : null
}

export const INTERIM2_PM_TEMPLATE_NAME = 'INTERIM 2 PM Checklist (Site Copy V1.1)'

export const INTERIM2_PM_PAGES: Interim2PmPageConfig[] = [
  {
    pageNum: 1,
    title: 'DEF SYSTEM - TANKS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Visually inspect for anything abnormal',
      'Check for leaks',
      'Check heater is powered, operational and temperature is consistent.',
      'Review the Fluid Management System levels and points. If issues create work order and contact National Energy Equipment for repairs',
      'Inspect tank and level sensor: Ensure there are no signs of corrosion, leakage or damage.',
      'Comments',
    ],
    rows: [
      ['DEF 15,000LT TANK', 'TANK#1', 'TMC_A_M5400'],
      ['DEF 15,000LT TANK', 'TANK#2', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 2,
    title: 'DEF SYSTEM - VALVES',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Lubricate moving parts (if needed) to prevent sticking',
      'Check for leaks',
      'Check for wear: Inspect seals and replace if leaking',
      'Comments',
    ],
    rows: [
      ['MOTORIZED VALVE 1', 'MV-1', 'TMC_A_M5400'],
      ['MOTORIZED VALVE 2', 'MV-2', 'TMC_A_M5400'],
      ['MOTORIZED VALVE 3', 'MV-3', 'TMC_A_M5400'],
      ['MANUAL', 'MV-#', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 3,
    title: 'DEF SYSTEM - FILTERS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Inspect the differential pressure around the filter, make a log, the differential pressure should be minimal and consistent, if it above normal, this is an indication the filter needs to be replaced.',
      'Inspect and replace, if sediment building up, create work order to clean filter housing',
      'Check for wear: Inspect seals and replace if leaking',
      'Comments',
    ],
    rows: [
      ['INCOMING DEF FLUID FILTER', 'F-1', 'TMC_A_M5400'],
      ['OUTGOING DEF FLUID FILTER', 'F-2', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 4,
    title: 'DEF SYSTEM - DEF DISPENSERS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Ensure the Solenoid valve is opening and closing when Dispenser is unlocking',
      'Test all the soleniod valves for reponsiveness',
      'Visually inspect: check piping system for leaks',
      'Ensure heater is operational (winter)',
      'Inspect Nozzle for leaks. If nozzle is leaking, replace with spare & create work order for repair leak within nozzle. Follow manufacturers recommendations',
      'Inspect the DEF isolation valve to the dispenser, ensure opens and closes with ease.',
      'Add lubrication to the valve stem as necessary',
    ],
    rows: [
      ['DEF DISPENSER STATION 1', 'FP-03-1', 'TMC_A_M5400'],
      ['DEF DISPENSER STATION 2', 'FP-03-2', 'TMC_A_M5400'],
      ['DEF DISPENSER STATION 3', 'FP-03-3', 'TMC_A_M5400'],
      ['DEF DISPENSER STATION 4', 'FP-03-4', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 5,
    title: 'DEF SYSTEM - PIPING',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Visually inspect the piping system',
      'Check for any leaks & abnormal noises',
      'Check all valves & ensure they are properly opening and closing. If there are any leaks or sticking/bypassing valves - create work order to repair',
    ],
    rows: [
      ['DEF PIPING SYSTEM', 'DEF PIPING', 'TMC_A_M5400'],
      ['DEF PIPING SYSTEM', 'DEF PIPING', 'TMC_A_M5400'],
      ['DEF PIPING SYSTEM', 'DEF PIPING', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 6,
    title: 'DEF SYSTEM - FLOW METERS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Check for any leaks or abnormal noises, ensure metering volume is consistent for given timeframe (volume vs time)',
      'Verify the volume on HMI screen is within tolerance of the volume provided from DEF supply vendor, make note. If accuracy has fluctuated from the log, more than, recalibration is required. Refer to manufacturers recommendations',
      'Comments',
    ],
    rows: [
      ['INCOMING FLOW METER', 'FM-1', 'TMC_A_M5400'],
      ['OUTGOING FLOW METER', 'FM-2', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 7,
    title: 'DEF SYSTEM - PRESSURE & TEMPERATURE TRANSDUCERS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Check calibration: Ensure accuracy with visual gauges nearby and reset if required. Refer to manufacturers maintenance manual',
      'Inspect for wear: Clean and recalibrate IF REQUIRED. Refer to manufacturers recommendations.',
      'Comments',
    ],
    rows: [
      ['DIFFERENTIAL PRESSURE SWITCH INCOMING FLUID FILTER', 'DPTR-1', 'TMC_A_M5400'],
      ['DIFFERENTIAL PRESSURE SWITCH OUTGOING FLUID FILTER', 'DPTR-2', 'TMC_A_M5400'],
      ['THERMOWELL TEMP. SENSOR', 'THS-1', 'TMC_A_M5400'],
      ['THERMOWELL TEMP. SENSOR', 'THS-2', 'TMC_A_M5400'],
      ['PRESSURE TRANSMITTER SENSOR', 'PT-2', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 8,
    title: 'DEF SYSTEM - PUMPS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Inspect air valve, check for proper cycling and clean as necessary.',
      'Check system pressure, ensure air and fluid pressure are within range.',
      'Check FRL gauge is holding pressure, there is no air leaks & ensure Air solenoids are opening and closing as required.',
      'Clean air filter, ensure no clogging.',
      'If pumps become loud, check the exhaust for leaks, replace as needed',
      'Comments',
    ],
    rows: [
      ['PUMP 1', 'P1', 'TMC_A_M5400'],
      ['PUMP 2', 'P2', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 9,
    title: 'SANDING SYSTEM - SAND DISPENSERS / PUMPS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'KEB Unijet Blower Fan - VISUALLY INPECT FOR ABNORMAL NOISE AND/OR VIBRATION',
      'KEB Unijet Blower Fan - CLEAN THE CASING AREA AND CHECK MOTOR SURFACE TEMPERATURE WHILE RUNNING',
      'DN40 Pinch Valve - VISUAL INSPECTION OF BODY AND SLEVES AND CYCLE TEST OPENING AND CLOSING',
      'PRESSURE REDUCING VALVES, QUICK EXHAUST VALVE SAFETY VALVE - VISUALLY INSPECT THE VALVE AND SEALS FOR ANYTHING ABNORMAL',
      'VACUUM SAND OFF PLATFORM',
      'LUBRICATE GUARD RAIL WHEELS',
      'VACUUM GUARD RAILS',
      'ENSURE NOZZLE IS IN HOLSTER',
      'Comments',
    ],
    rows: [
      ['SAND DISPENSERS 1', 'FP-01-01', 'TMC_A_M5003'],
      ['SAND DISPENSERS 2', 'FP-01-02', 'TMC_A_M5003'],
      ['SAND DISPENSERS 3', 'FP-01-03', 'TMC_A_M5003'],
      ['SAND DISPENSERS 4', 'FP-01-04', 'TMC_A_M5003'],
      ['SAND DISPENSERS 5', 'FP-01-05', 'TMC_A_M5003'],
      ['SAND DISPENSERS 6', 'FP-01-06', 'TMC_A_M5003'],
    ],
  },
  {
    pageNum: 10,
    title: 'SANDING SYSTEM - SAND DISPENSERS / PUMPS (continued)',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'KEB Unijet Blower Fan - VISUALLY INPECT FOR ABNORMAL NOISE AND/OR VIBRATION',
      'KEB Unijet Blower Fan - CLEAN THE CASING AREA AND CHECK MOTOR SURFACE TEMPERATURE WHILE RUNNING',
      'DN40 Pinch Valve - VISUAL INSPECTION OF BODY AND SLEVES AND CYCLE TEST OPENING AND CLOSING',
      'PRESSURE REDUCING VALVES, QUICK EXHAUST VALVE SAFETY VALVE - VISUALLY INSPECT THE VALVE AND SEALS FOR ANYTHING ABNORMAL',
      'VACUUM SAND OFF PLATFORM',
      'LUBRICATE GUARD RAIL WHEELS',
      'VACUUM GUARD RAILS',
      'ENSURE NOZZLE IS IN HOLSTER',
      'Comments',
    ],
    rows: [
      ['SAND DISPENSERS 7', 'FP-01-07', 'TMC_A_M5300'],
      ['SAND DISPENSERS 8', 'FP-01-08', 'TMC_A_M5003'],
    ],
  },
  {
    pageNum: 11,
    title: 'SANDING SYSTEM - SILO DUST COLLECTOR',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Visual inspection of equipment and confim all saefty devices active',
      'Monitor for abnormal noise and vibration',
      'Check control panel and and test functionality',
      'Check filter element differiential pressure and surface condition',
      'check compressed air pressure and drain moisture',
      'Check air pressure (5-6bar) & inspect air hose connetion for wear to tear',
      'Test all the soleniod valves for reponsiveness',
      'VCP Presure control valve- Visual inspection of wer, damage or seal integrity & Clean accumulated dust from vlave exterior',
      'AKO VF/VMC Pinch Valve - Visual inspection of valve body and control lines',
      'KAT Truck Pipe Connection - Visual inspection of housing, connectors, hardware and sensor dust or build up around inductive sensor',
      'Goetze PRV (681 Type) - Check for leaks, corrosion, and gauge accuracy, tighten mechanical fastners',
      'Comments',
    ],
    rows: [['SILO DUST COLLECTOR', 'SAND SILO', 'TMC_A_M5003']],
  },
  {
    pageNum: 12,
    title: 'WWF SYSTEM - TANKS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Visually inspect for anything abnormal',
      'Review the Fluid Management System levels and points. If issues create work order and contact National Energy Equipment for repairs',
      'Comments',
    ],
    rows: [['WWF 2,270LT TANK', 'TANK#1', 'TMC_A_M5300']],
  },
  {
    pageNum: 13,
    title: 'WWF SYSTEM - VALVES',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Visually inspect for anything abnormal',
      'Lubricate moving parts (if needed) to prevent sticking',
      'Check for leaks',
      'Check for wear: Inspect seals and replace if leaking',
      'Inspect for corrosion or wear and replace parts as needed',
      'Comments',
    ],
    rows: [
      ['MOTORIZED VALVE 4', 'MV-4', 'TMC_A_M5300'],
      ['MANUAL VALVES', 'MV-#', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 14,
    title: 'WWF SYSTEM - FILTERS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Inspect the differential pressure around the filter, make a log, the differential pressure should be minimal and consistent, if it above normal, this is an indication the filter needs to be replaced.',
      'Inspect and replace, if sediment building up, create work order to clean filter housing',
      'Check for wear: Inspect seals and replace if leaking',
      'Comments',
    ],
    rows: [
      ['INCOMING WWF FLUID FILTER', 'F-3', 'TMC_A_M5300'],
      ['OUTGOING WWF FLUID FILTER', 'F-4', 'TMC_A_M5300'],
    ],
  },
  {
    pageNum: 15,
    title: 'WWF SYSTEM - DISPENSERS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Ensure hose reel operational & retracting mechanism is working well',
      'Visually check for leaks around pipe fittings',
      'Ensure the WWF reel is supplying adequate flow',
      'If nozzle is leaking, replace with spare & repair leak within nozzle. Follow manufacturers recommendations',
      'Inspect the WWF isolation valve to the dispenser, ensure opens and closes with ease. Add lubrication to the valve stem as necessary',
      'Inspect the WWF Dispensing Nozzle, ensure there is no leaks & the visual gauge is working',
    ],
    rows: [
      ['WWF REEL', 'FP-04-1', 'TMC_A_M5300'],
      ['WWF REEL', 'FP-04-2', 'TMC_A_M5300'],
      ['WWF REEL', 'FP-04-3', 'TMC_A_M5300'],
      ['WWF REEL', 'FP-04-4', 'TMC_A_M5300'],
    ],
  },
  {
    pageNum: 16,
    title: 'WWF SYSTEM - PIPING',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Visually inspect the piping system',
      'Check for any leaks & abnormal noises',
      'Check all valves & ensure they are properly opening and closing. If there are any leaks or sticking/bypassing valves - create work order to repair',
    ],
    rows: [
      ['WWF PIPING SYSTEM', 'WWF PIPING', 'TMC_A_M5300'],
      ['WWF PIPING SYSTEM', 'WWF PIPING', 'TMC_A_M5300'],
      ['WWF PIPING SYSTEM', 'WWF PIPING', 'TMC_A_M5300'],
    ],
  },
  {
    pageNum: 17,
    title: 'WWF SYSTEM - FLOW METERS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Check for any leaks or abnormal noises, ensure metering volume is consistent for given timeframe (volume vs time)',
      'Verify the volume on HMI screen is within tolerance of the volume provided from DEF supply vendor, make note. If accuracy has fluctuated from the log, more than, recalibration is required. Refer to manufacturers recommendations',
      'Check for wear: Inspect seals and replace if leaking',
      'Comments',
    ],
    rows: [
      ['INCOMING WWF FLOW', 'FM-3', 'TMC_A_M5300'],
      ['OUTGOING WWF FLOW', 'FM-4', 'TMC_A_M5300'],
    ],
  },
  {
    pageNum: 18,
    title: 'WWF SYSTEM - PRESSURE & TEMPERATURE TRANSDUCERS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Visually inspect for anything abnormal',
      'Review the Fluid Management System levels and points. If issues create work order and contact National Energy Equipment for repairs',
      'Comments',
    ],
    rows: [
      ['DIFFERENTIAL PRESSURE SWITCH OUTGOING FLUID FILTER', 'DPTR-2', 'TMC_A_M5400'],
      ['THERMOWELL TEMP. SENSOR', 'THS-1', 'TMC_A_M5400'],
      ['THERMOWELL TEMP. SENSOR', 'THS-2', 'TMC_A_M5400'],
      ['PRESSURE TRANSMITTER SENSOR', 'PT-1', 'TMC_A_M5300'],
      ['PRESSURE TRANSMITTER SENSOR', 'PT-2', 'TMC_A_M5400'],
    ],
  },
  {
    pageNum: 19,
    title: 'WWF SYSTEM - PUMPS',
    columns: [
      'Component',
      'TAG',
      'REFERANCE DWG',
      'Inspect air valve, check for proper cycling and clean as necessary.',
      'Check system pressure, ensure air and fluid pressure are within range.',
      'Check FRL gauge is holding pressure, there is no air leaks & ensure Air solenoids are opening and closing as required.',
      'Clean air filter, ensure no clogging.',
      'If pumps become loud, check the exhaust for leaks, replace as needed. If there is a pressure loss, replace with spare pump &/or repair the diaphragm with wet kit & replace air valve with dry kit.',
      'Comments',
    ],
    rows: [
      ['WWF PUMP 3', 'P3', 'TMC_A_M5300'],
      ['WWF PUMP 4', 'P4', 'TMC_A_M5300'],
    ],
  },
]
