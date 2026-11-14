import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import land from 'world-atlas/countries-110m.json'
import { sectionMeta, type Entry } from '../domain/model.ts'

interface AtlasTopology extends Topology {
  objects: {
    countries: GeometryCollection
  }
}

const topology = land as unknown as AtlasTopology
const countries = (feature(topology, topology.objects.countries) as FeatureCollection).features

type Marker = Entry & { picked: boolean }

interface GlobeSceneProps {
  entries: Entry[]
  selected: Entry | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

export default function GlobeScene({ entries, selected, onSelect, onHover }: GlobeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [size, setSize] = useState({ width: 640, height: 480 })
  const markers = useMemo<Marker[]>(
    () => entries.map((entry) => ({ ...entry, picked: entry.id === selected?.id })),
    [entries, selected],
  )

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const measure = () => {
      setSize({
        width: Math.max(mount.clientWidth, 1),
        height: Math.max(mount.clientHeight, 1),
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(mount)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!ready || !globeRef.current) return
    const controls = globeRef.current.controls()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.autoRotate = !selected && !reduceMotion
    controls.autoRotateSpeed = 0.28
    controls.enablePan = false
    if (!selected) return
    globeRef.current.pointOfView(
      { lat: selected.lat, lng: selected.lng, altitude: 0.72 },
      reduceMotion ? 0 : 1100,
    )
  }, [ready, selected])

  const markerElement = useCallback(
    (datum: object) => {
      const entry = datum as Marker
      const wrap = document.createElement('div')
      wrap.className = 'pin-wrap'
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = entry.picked ? 'pin picked' : 'pin'
      dot.style.backgroundColor = sectionMeta(entry.section).color
      if (entry.photo) {
        dot.style.backgroundImage = `url("${entry.photo}")`
        dot.classList.add('has-photo')
      }
      dot.setAttribute('aria-label', `${entry.title}, ${entry.city}`)
      dot.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelect(entry.id)
      })
      dot.addEventListener('pointerenter', () => onHover(entry.id))
      dot.addEventListener('pointerleave', () => onHover(null))
      wrap.append(dot)
      if (entry.picked) {
        const label = document.createElement('div')
        label.className = 'pin-label'
        label.textContent = `${entry.title} · ${entry.city}`
        wrap.append(label)
      }
      return wrap
    },
    [onHover, onSelect],
  )

  return (
    <div className="globe-mount" ref={mountRef}>
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="#081311"
        rendererConfig={{
          antialias: true,
          alpha: false,
          failIfMajorPerformanceCaveat: false,
          powerPreference: 'high-performance',
        }}
        showAtmosphere
        atmosphereColor="#e2c48a"
        atmosphereAltitude={0.2}
        showGraticules={false}
        polygonsData={countries}
        polygonGeoJsonGeometry={(polygon) =>
          (polygon as Feature<Geometry>).geometry as unknown as { type: string; coordinates: number[] }
        }
        polygonCapColor={() => '#2f6d5e'}
        polygonSideColor={() => '#16382f'}
        polygonStrokeColor={() => '#f0e2c8'}
        polygonAltitude={0.006}
        polygonsTransitionDuration={0}
        ringsData={selected ? [selected] : []}
        ringLat="lat"
        ringLng="lng"
        ringColor={() => '#f3ead7'}
        ringMaxRadius={3.2}
        ringPropagationSpeed={1}
        ringRepeatPeriod={1400}
        htmlElementsData={markers}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={0.01}
        htmlElement={markerElement}
        htmlTransitionDuration={0}
        onGlobeReady={() => {
          const live = globeRef.current as GlobeMethods & {
            lights: () => { intensity: number; isAmbientLight?: boolean; isDirectionalLight?: boolean }[]
          }
          try {
            const lights = live.lights()
            if (Array.isArray(lights)) {
              for (const light of lights) {
                if (light.isAmbientLight) light.intensity = Math.PI * 2.4
                if (light.isDirectionalLight) light.intensity = Math.PI * 0.45
              }
            }
          } catch {
            /* default lighting still draws the globe */
          }
          globeRef.current?.pointOfView({ lat: 18, lng: 12, altitude: 2.2 }, 0)
          setReady(true)
        }}
      />
    </div>
  )
}
