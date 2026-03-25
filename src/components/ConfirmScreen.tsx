interface Props {
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmScreen({ onConfirm, onCancel }: Props) {
  return (
    <section className="confirm-screen">
      <h1 className="title title-small">Er du færdig?</h1>
      <p className="confirm-text">
        Indkøbsturen afsluttes, og butikkens rækkefølge opdateres til næste gang.
      </p>
      <div className="confirm-actions">
        <button type="button" className="btn-primary" onClick={onConfirm}>
          Ja, afslut indkøb
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Nej, fortsæt
        </button>
      </div>
    </section>
  )
}
