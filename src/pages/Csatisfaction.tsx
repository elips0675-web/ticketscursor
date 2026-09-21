import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Star, CheckCircle, Loader2 } from 'lucide-react'
import { API_URL } from '@/lib/api'

export default function Csatisfaction() {
  const { token } = useParams<{ token: string }>()
  const [survey, setSurvey] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/csat/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setSurvey(data.data)
          if (data.alreadyResponded) setSubmitted(true)
        } else {
          setError(data.message || 'Survey not found')
        }
      })
      .catch(() => setError('Failed to load survey'))
      .finally(() => setLoading(false))
  }, [token])

  const submit = async () => {
    if (!rating) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/csat/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      })
      const data = await res.json()
      if (data.success) {
        setSubmitted(true)
      } else {
        setError(data.message || 'Failed to submit')
      }
    } catch {
      setError('Failed to submit response')
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <CardTitle>Thank you!</CardTitle>
            <CardDescription>Your feedback has been recorded. We appreciate your time.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Rate our service</CardTitle>
          <CardDescription>Ticket: {survey?.ticket?.title || `#${survey?.ticket_id}`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(0)}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  className={`w-8 h-8 ${
                    n <= (hovered || rating) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                  }`}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {rating <= 2 ? "We're sorry to hear that" : rating <= 3 ? 'Thank you' : 'Great to hear!'}
            </p>
          )}
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment..."
            rows={3}
          />
          <Button onClick={submit} disabled={!rating || submitting} className="w-full gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit feedback
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
