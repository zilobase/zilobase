import Chatbot from '@/components/ai-elements/chatbot'

export default function AiPage() {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <main className="box-border h-full min-h-0 overflow-hidden px-4 py-4 md:py-6">
        <section className="mx-auto h-full min-h-0 w-full max-w-5xl">
          <Chatbot />
        </section>
      </main>
    </div>
  )
}
