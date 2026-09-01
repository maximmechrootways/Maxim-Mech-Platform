declare module '3d-force-graph' {
  type GraphData = { nodes: object[]; links: object[] }

  interface ForceGraph3DInstance {
    (element: HTMLElement): ForceGraph3DInstance
    graphData(data: GraphData): ForceGraph3DInstance
    backgroundColor(color: string): ForceGraph3DInstance
    showNavInfo(show: boolean): ForceGraph3DInstance
    nodeLabel(fn: string | ((node: object) => string)): ForceGraph3DInstance
    nodeColor(fn: string | ((node: object) => string)): ForceGraph3DInstance
    nodeVal(fn: string | ((node: object) => number)): ForceGraph3DInstance
    nodeOpacity(n: number): ForceGraph3DInstance
    linkColor(fn: string | ((link: object) => string)): ForceGraph3DInstance
    linkWidth(n: number | ((link: object) => number)): ForceGraph3DInstance
    linkOpacity(n: number): ForceGraph3DInstance
    onNodeClick(fn: (node: object, event: MouseEvent) => void): ForceGraph3DInstance
    width(n: number): ForceGraph3DInstance
    height(n: number): ForceGraph3DInstance
    _destructor?: () => void
  }

  export default function ForceGraph3D(): ForceGraph3DInstance
}
