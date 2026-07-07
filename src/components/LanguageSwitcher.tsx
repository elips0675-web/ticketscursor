import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const lng = i18n.language?.startsWith("en") ? "en" : "ru"
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => i18n.changeLanguage(lng === "ru" ? "en" : "ru")}
      className="w-full justify-center text-xs font-bold uppercase tracking-widest"
      aria-label={t("common.switchLang", "Переключить язык")}
    >
      {lng === "ru" ? "EN" : "RU"}
    </Button>
  )
}
