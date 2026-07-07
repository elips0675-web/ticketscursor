import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Grid3X3, List, FileText, Image, FileCode, File, Folder, Loader2, Upload, X } from "lucide-react"
import type { FileItem, FileFolder } from "@/types"
import { useAuth } from "@/context/AuthContext"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

const API = "http://localhost:4000/api"

export default function FilesPage() {
  const { token } = useAuth()
  const { t } = useTranslation()
  const CATEGORIES = [
    { key: "all", label: t("files.catAll"), icon: Folder },
    { key: "img", label: t("files.catImages"), icon: Image },
    { key: "pdf", label: t("files.catPDF"), icon: FileText },
    { key: "doc", label: t("files.catDocs"), icon: FileText },
    { key: "code", label: t("files.catCode"), icon: FileCode },
  ]
  const [folders, setFolders] = useState<FileFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFolder, setActiveFolder] = useState<number | null>(null)
  const [category, setCategory] = useState("all")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const fetchFolders = useCallback(() => {
    fetch(`${API}/files/folders`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const mapped = data.map((f: any) => ({
          id: f.id,
          name: f.name,
          files: (f.files || []).map((file: any) => ({
            id: file.id,
            name: file.name,
            size: file.size,
            type: file.type,
            folderId: file.folderId,
            path: file.path,
            createdAt: file.createdAt,
          })),
        }))
        setFolders(mapped)
        if (mapped.length > 0 && activeFolder === null) setActiveFolder(mapped[0].id)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token, activeFolder])

  useEffect(() => { fetchFolders() }, [fetchFolders])

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (activeFolder) fd.append('folderId', String(activeFolder))
      const res = await fetch(`${API}/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (res.ok) {
        toast.success(t("files.uploadSuccess", { name: file.name }))
        fetchFolders()
      } else {
        toast.error(t("files.uploadError"))
      }
    } catch { toast.error(t("files.uploadError")) }
    setUploading(false)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(uploadFile)
  }, [activeFolder, token])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current++; setDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach(uploadFile)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const currentFolder = folders.find(f => f.id === activeFolder)
  const allFiles = useMemo(() => folders.flatMap(f => f.files.map(file => ({ ...file, folder: f.name }))), [folders])

  const displayFiles = useMemo(() => {
    const source = search ? allFiles : (currentFolder?.files || [])
    return source
      .filter(f => category === "all" || f.type === category)
      .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()))
  }, [search, allFiles, currentFolder, category])

  return (
    <div
      className="space-y-6"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Файлы</h1>
        <p className="text-sm text-muted-foreground mt-1">Управление файлами и документами</p>
      </div>

      {dragging && (
        <div className="fixed inset-0 z-50 bg-primary/10 flex items-center justify-center pointer-events-none">
          <div className="bg-background border-2 border-dashed border-primary rounded-2xl p-12 text-center">
            <Upload className="w-12 h-12 mx-auto mb-3 text-primary" />
            <p className="font-bold text-lg">Отпустите файлы для загрузки</p>
          </div>
        </div>
      )}

      <Card className="border-dashed border-2 bg-muted/20">
        <CardContent className="p-6 text-center" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="font-bold text-sm">{t("files.dropzone")}</p>
          {uploading && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-2 text-primary" />}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <>
      <div className="flex flex-wrap gap-2">
        {folders.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(f.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
              activeFolder === f.id ? "bg-primary text-primary-foreground shadow" : "bg-card border hover:bg-muted"
            }`}
          >
            <Folder className="w-4 h-4" />
            {f.name}
            <Badge variant={activeFolder === f.id ? "default" : "secondary"} className="text-[9px] ml-1">
              {f.files.length}
            </Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={search ? t("files.searchAll") : t("files.searchInFolder")}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList className="h-8">
              {CATEGORIES.map(c => (
                <TabsTrigger key={c.key} value={c.key} className="text-[10px] px-2 h-7 gap-1">
                  <c.icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{c.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" onClick={() => setView(v => v === "grid" ? "list" : "grid")} aria-label={view === "grid" ? "Вид списком" : "Вид сеткой"}>
            {view === "grid" ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {displayFiles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <File className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-bold text-sm">{search ? "Ничего не найдено" : t("files.empty")}</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {displayFiles.map(f => (
            <Card key={f.id} className="hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer" onClick={() => f.path && window.open(`${API.replace('/api', '')}${f.path}?token=${localStorage.getItem('token')}`, '_blank')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.path && window.open(`${API.replace('/api', '')}${f.path}?token=${localStorage.getItem('token')}`, '_blank'); } }}>
              <CardContent className="p-5 text-center">
                <div className="text-4xl mb-3">
                  {{ img: "🖼️", pdf: "📄", doc: "📝", code: "💻", archive: "🗜️" }[f.type] || "📁"}
                </div>
                <p className="text-sm font-bold truncate">{f.name}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{f.size}{f.folder ? ` • ${f.folder}` : ""}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-2 divide-y">
            {displayFiles.map(f => (
              <div key={f.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors">
                <span className="text-2xl w-8 text-center">{"🖼️📄📝💻🗜️".includes(f.type) ? f.type : "📁"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {f.size}{f.folder ? ` • ${f.folder}` : ""}{f.createdAt ? ` • ${f.createdAt}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  )
}
