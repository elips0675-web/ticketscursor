import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CalendarDays, ArrowRight, Calculator, Sunrise } from 'lucide-react'
import { format, addDays, differenceInCalendarDays, eachDayOfInterval, isWeekend, addBusinessDays, differenceInBusinessDays } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'

function isHoliday(d: Date): boolean {
  const dd = d.getDate()
  const mm = d.getMonth()
  return (
    (mm === 0 && dd === 1) || (mm === 0 && dd === 7) ||
    (mm === 1 && dd === 23) || (mm === 2 && dd === 8) ||
    (mm === 4 && dd === 1) || (mm === 4 && dd === 9) ||
    (mm === 5 && dd === 12) || (mm === 10 && dd === 4)
  )
}

function isWorkingDay(d: Date): boolean {
  return !isWeekend(d) && !isHoliday(d)
}

function countWorkingDays(start: Date, end: Date): number {
  const days = eachDayOfInterval({ start, end })
  return days.filter(isWorkingDay).length
}

export default function CalculatorPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('days-to-date')

  const [startDate1, setStartDate1] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [workDays, setWorkDays] = useState('5')
  const [resultDate, setResultDate] = useState<string | null>(null)
  const [calendarDays1, setCalendarDays1] = useState<number | null>(null)

  const [startDate2, setStartDate2] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endDate2, setEndDate2] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'))
  const [workDaysCount, setWorkDaysCount] = useState<number | null>(null)
  const [calendarDays2, setCalendarDays2] = useState<number | null>(null)
  const [holidaysInRange, setHolidaysInRange] = useState<number | null>(null)

  const calcDaysToDate = () => {
    const start = new Date(startDate1)
    const days = parseInt(workDays, 10)
    if (isNaN(start.getTime()) || isNaN(days) || days < 1) return

    let count = 0
    let current = start
    while (count < days) {
      current = addDays(current, 1)
      if (isWorkingDay(current)) count++
    }
    setResultDate(format(current, 'd MMMM yyyy (EEEE)', { locale: ru }))
    setCalendarDays1(differenceInCalendarDays(current, start))
  }

  const calcDatesToDays = () => {
    const start = new Date(startDate2)
    const end = new Date(endDate2)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return

    const totalDays = differenceInCalendarDays(end, start)
    const wd = differenceInBusinessDays(end, start)
    const holidays = eachDayOfInterval({ start, end }).filter(d => isHoliday(d) && !isWeekend(d)).length

    setCalendarDays2(totalDays)
    setWorkDaysCount(wd)
    setHolidaysInRange(holidays)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="w-6 h-6 text-primary" />
          Калькулятор отпуска
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Рабочие дни, даты и праздники</p>
      </div>

      <Card>
        <CardContent className="p-5">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-5">
              <TabsTrigger value="days-to-date" className="gap-2">
                <Sunrise className="w-4 h-4" />
                Дни → Дата
              </TabsTrigger>
              <TabsTrigger value="dates-to-days" className="gap-2">
                <CalendarDays className="w-4 h-4" />
                Дата → Дни
              </TabsTrigger>
            </TabsList>

            <TabsContent value="days-to-date" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start1">Дата начала</Label>
                  <Input id="start1" type="date" value={startDate1} onChange={(e) => setStartDate1(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="workdays">Рабочих дней</Label>
                  <Input id="workdays" type="number" min="1" value={workDays} onChange={(e) => setWorkDays(e.target.value)} />
                </div>
              </div>
              <Button onClick={calcDaysToDate} className="gap-2">
                <ArrowRight className="w-4 h-4" />
                Рассчитать
              </Button>

              {resultDate && (
                <div className="rounded-lg bg-primary/5 border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Дата окончания:</span>
                    <span className="text-lg font-bold">{resultDate}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Календарных дней:</span>
                    <span className="font-medium">{calendarDays1} дн.</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Рабочих дней:</span>
                    <span className="font-medium">{workDays} дн.</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Выходные/праздники:</span>
                    <span className="font-medium">{calendarDays1! - parseInt(workDays)} дн.</span>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="dates-to-days" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start2">Дата начала</Label>
                  <Input id="start2" type="date" value={startDate2} onChange={(e) => setStartDate2(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end2">Дата окончания</Label>
                  <Input id="end2" type="date" value={endDate2} onChange={(e) => setEndDate2(e.target.value)} />
                </div>
              </div>
              <Button onClick={calcDatesToDays} className="gap-2">
                <ArrowRight className="w-4 h-4" />
                Рассчитать
              </Button>

              {workDaysCount !== null && (
                <div className="rounded-lg bg-primary/5 border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Рабочих дней:</span>
                    <span className="text-lg font-bold">{workDaysCount} дн.</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Календарных дней:</span>
                    <span className="font-medium">{calendarDays2} дн.</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Выходные:</span>
                    <span className="font-medium">{calendarDays2! - workDaysCount - (holidaysInRange || 0)} дн.</span>
                  </div>
                  {holidaysInRange! > 0 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Праздничные дни:</span>
                      <span className="font-medium">{holidaysInRange} дн.</span>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground space-y-1">
          <p className="font-bold text-foreground">Праздники (учитываются):</p>
          <p>1–7 янв, 23 фев, 8 мар, 1–9 май, 12 июн, 4 ноя</p>
          <p className="text-xs mt-2">Суббота и воскресенье не считаются рабочими днями.</p>
        </CardContent>
      </Card>
    </div>
  )
}
