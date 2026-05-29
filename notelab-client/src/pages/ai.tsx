import Chatbot from '@/components/ai-elements/chatbot'

export default function AiPage() {
  return (
    <div className="min-h-full">
      <main className="min-h-full px-4 pb-0 md:py-6">
        <section className="mx-auto min-h-full w-full max-w-5xl">
          <Chatbot />
        </section>
      </main>
    </div>
  )
}
