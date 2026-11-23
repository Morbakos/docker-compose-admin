import { Component, EventEmitter, Input, Output } from "@angular/core";
import type { ComposeContainer } from "../docker.service";

@Component({
  selector: "app-container-list",
  standalone: true,
  template: `
    <section class="panel">
      <div class="panel-heading"><div><h2>Services en cours</h2><p>État réel des conteneurs de ce projet.</p></div><span class="count">{{ containers.length }}</span></div>
      @if (loading) { <p class="muted">Chargement des services…</p> }
      @else if (containers.length === 0) { <p class="muted">Aucun conteneur pour le moment. Démarrez les services sélectionnés pour les voir apparaître ici.</p> }
      @else {
        <div class="container-list">
          @for (container of containers; track container.id) {
            <article class="container-row">
              <div class="container-main"><span class="state-dot" [class.running]="container.state === 'running'"></span><div><strong>{{ container.service || container.name }}</strong><small>{{ container.name }}</small></div></div>
              <div class="container-meta"><span class="state-label" [class.running-label]="container.state === 'running'">{{ container.status }}</span><span>CPU <b>{{ container.cpu ?? '—' }}</b></span><span>RAM <b>{{ container.memory ?? '—' }}</b></span></div>
              <div class="container-actions">
                @if (container.state !== 'running') { <button type="button" [disabled]="busy" (click)="action.emit({container, action:'start'})">Démarrer</button> }
                @else { <button type="button" [disabled]="busy" (click)="action.emit({container, action:'stop'})">Arrêter</button> }
                <button type="button" [disabled]="busy" (click)="action.emit({container, action:'restart'})">Redémarrer</button>
              </div>
              @if (container.ports.length) { <div class="ports"><span>Ports</span>@for (port of container.ports; track port) { <code>{{ port }}</code> }</div> }
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host{display:block}.panel{padding:22px;border:1px solid #e5eaf1;border-radius:14px;background:#fff}.panel-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    h2{margin:0 0 4px;color:#27364d;font-size:18px}.panel-heading p,.muted{margin:0;color:#8995a7;font-size:13px;line-height:1.5}.count{padding:5px 9px;border-radius:14px;color:#65758e;background:#f0f3f8;font-size:12px}
    .container-list{display:grid;gap:9px}.container-row{display:grid;grid-template-columns:minmax(160px,1fr) auto auto;align-items:center;gap:12px;padding:13px;border:1px solid #edf0f5;border-radius:9px}
    .container-main{display:flex;min-width:0;align-items:center;gap:10px}.container-main>div{display:grid;min-width:0;gap:3px}.container-main strong{overflow:hidden;color:#35445b;font-size:13px;text-overflow:ellipsis}.container-main small{overflow:hidden;color:#96a1b0;font-size:11px;text-overflow:ellipsis}
    .state-dot{width:9px;height:9px;flex:0 0 auto;border-radius:50%;background:#d5a04f}.state-dot.running{background:#35b77c;box-shadow:0 0 0 4px #35b77c18}
    .container-meta{display:flex;align-items:center;gap:12px;color:#8995a7;font-size:11px}.container-meta b{color:#53637a}.state-label{padding:4px 7px;border-radius:12px;background:#fff5e8;color:#a17c44}.running-label{background:#eaf8f1;color:#25875e}
    .container-actions{display:flex;gap:5px}.container-actions button{padding:6px 8px;border:1px solid #e2e8f1;border-radius:6px;color:#5c6c83;background:#fff;font:inherit;font-size:11px;cursor:pointer}.container-actions button:disabled{opacity:.5}
    .ports{grid-column:1/-1;display:flex;align-items:center;gap:7px;color:#8995a7;font-size:11px}.ports code{padding:3px 6px;border-radius:4px;color:#4d70a8;background:#edf3fb}
    @media(max-width:760px){.container-row{grid-template-columns:1fr}.container-meta,.container-actions{padding-left:19px}.ports{grid-column:auto}}
  `],
})
export class ContainerListComponent {
  @Input() containers: ComposeContainer[] = [];
  @Input() loading = false;
  @Input() busy = false;
  @Output() action = new EventEmitter<{container: ComposeContainer; action: "start"|"stop"|"restart"}>();
}