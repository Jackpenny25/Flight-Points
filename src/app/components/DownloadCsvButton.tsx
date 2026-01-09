import React from 'react'
import { exportAllCsvs } from './downloadCsvUtil'

type Props = { accessToken?: string | null }

export default function DownloadCsvButton({ accessToken }: Props) {
  const handleDownload = async () => {
    try {
      const res = await exportAllCsvs(accessToken)
      if (res && res.topCadet) {
        alert(`Exported CSVs. Top cadet: ${res.topCadet.name} (${res.topCadet.totalPoints} points)`)
      } else {
        alert('Exported CSVs')
      }
    } catch (err: any) {
      console.error(err)
      alert(err?.message || 'Failed to download CSVs. See console for details.')
    }
  }

  return (
    <button
      onClick={handleDownload}
      className="ml-3 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-sm"
      title="Download cadets and points CSVs"
    >
      Download CSVs
    </button>
  )
}
