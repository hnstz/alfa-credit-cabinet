package ru.oldzoomer.alfacreditbackend.controller;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.oldzoomer.alfacreditbackend.dto.*;
import ru.oldzoomer.alfacreditbackend.entity.Application;
import ru.oldzoomer.alfacreditbackend.entity.Draft;
import ru.oldzoomer.alfacreditbackend.entity.User;
import ru.oldzoomer.alfacreditbackend.repository.ApplicationRepository;
import ru.oldzoomer.alfacreditbackend.repository.DraftRepository;
import ru.oldzoomer.alfacreditbackend.service.ApplicationPipelineService;
import ru.oldzoomer.alfacreditbackend.service.ClientService;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/applications")
public class ApplicationController {

    private final ApplicationRepository applicationRepository;
    private final DraftRepository draftRepository;
    private final ApplicationPipelineService pipelineService;
    private final ClientService clientService;

    public ApplicationController(ApplicationRepository applicationRepository,
                                 DraftRepository draftRepository,
                                 ApplicationPipelineService pipelineService,
                                 ClientService clientService) {
        this.applicationRepository = applicationRepository;
        this.draftRepository = draftRepository;
        this.pipelineService = pipelineService;
        this.clientService = clientService;
    }

    // --- Черновик ---

    @GetMapping("/draft/summary")
    public ResponseEntity<DraftSummaryDto> draftSummary(@AuthenticationPrincipal User user) {
        Optional<Draft> draft = draftRepository.findByUserId(user.getId());
        if (draft.isEmpty()) {
            return ResponseEntity.ok(null);
        }
        Draft d = draft.get();
        return ResponseEntity.ok(DraftSummaryDto.builder()
                .id(d.getId())
                .step(d.getStep())
                .totalSteps(4)
                .updatedAt(d.getUpdatedAt().toString())
                .build());
    }

    @GetMapping("/draft")
    public ResponseEntity<DraftDto> draft(@AuthenticationPrincipal User user) {
        Optional<Draft> draft = draftRepository.findByUserId(user.getId());
        return draft.map(d -> ResponseEntity.ok(DraftDto.builder()
                .id(d.getId())
                .formJson(d.getFormJson())
                .step(d.getStep())
                .updatedAt(d.getUpdatedAt().toString())
                .prefilled(d.getPrefilled())
                .build())).orElseGet(() -> ResponseEntity.ok(null));
    }

    @PostMapping("/draft")
    public ResponseEntity<DraftDto> createDraft(@AuthenticationPrincipal User user,
                                                @RequestBody(required = false) Map<String, Object> preset) {
        Instant now = Instant.now();
        Draft draft = new Draft();
        draft.setId("draft-" + user.getId() + "-" + System.currentTimeMillis());
        draft.setUserId(user.getId());
        draft.setFormJson("{}");
        draft.setStep(0);
        draft.setCreatedAt(now);
        draft.setUpdatedAt(now);
        draft.setPrefilled(List.of());

        draft = draftRepository.save(draft);
        return ResponseEntity.status(201).body(DraftDto.builder()
                .id(draft.getId())
                .formJson(draft.getFormJson())
                .step(draft.getStep())
                .updatedAt(draft.getUpdatedAt().toString())
                .prefilled(draft.getPrefilled())
                .build());
    }

    @PutMapping("/draft")
    public ResponseEntity<Map<String, String>> updateDraft(@AuthenticationPrincipal User user,
                                                           @RequestBody Map<String, Object> body) {
        Optional<Draft> opt = draftRepository.findByUserId(user.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("code", "NO_DRAFT", "message", "Черновик не найден"));
        }
        Draft draft = opt.get();
        draft.setFormJson((String) body.get("formJson"));
        draft.setStep((Integer) body.getOrDefault("step", 0));
        draft.setUpdatedAt(Instant.now());
        draftRepository.save(draft);
        return ResponseEntity.ok(Map.of("updatedAt", draft.getUpdatedAt().toString()));
    }

    @DeleteMapping("/draft")
    public ResponseEntity<Void> deleteDraft(@AuthenticationPrincipal User user) {
        Optional<Draft> opt = draftRepository.findByUserId(user.getId());
        opt.ifPresent(d -> draftRepository.delete(d));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/draft/submit")
    public ResponseEntity<ClientApplicationDto> submitDraft(@AuthenticationPrincipal User user) {
        Optional<Draft> opt = draftRepository.findByUserId(user.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(404).body(null);
        }
        Draft draft = opt.get();
        Instant now = Instant.now();

        Application app = pipelineService.createApplication(draft.getId(), user.getId(), now);
        // Copy form JSON
        app.setFormJson(draft.getFormJson());
        app.setUpdatedAt(now);
        app = applicationRepository.save(app);

        draftRepository.delete(draft);

        return ResponseEntity.status(201).body(toClientApplicationDto(app));
    }

    // --- Заявки ---

    @GetMapping
    public ResponseEntity<List<ApplicationSummaryDto>> list(@AuthenticationPrincipal User user) {
        List<Application> apps = applicationRepository.findByUserIdOrderByUpdatedAtDesc(user.getId());
        return ResponseEntity.ok(apps.stream().map(this::toSummaryDto).toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ClientApplicationDto> get(@AuthenticationPrincipal User user, @PathVariable String id) {
        Optional<Application> opt = applicationRepository.findById(id);
        if (opt.isEmpty() || !opt.get().getUserId().equals(user.getId())) {
            return ResponseEntity.status(404).body(null);
        }
        return ResponseEntity.ok(toClientApplicationDto(opt.get()));
    }

    @PostMapping("/{id}/offer/accept")
    public ResponseEntity<ClientApplicationDto> acceptOffer(@AuthenticationPrincipal User user, @PathVariable String id) {
        Application app = applicationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Заявка не найдена"));
        if (!app.getUserId().equals(user.getId())) {
            return ResponseEntity.status(403).body(null);
        }
        Application updated = pipelineService.acceptOffer(id, Instant.now());
        return ResponseEntity.ok(toClientApplicationDto(updated));
    }

    @PostMapping("/{id}/offer/decline")
    public ResponseEntity<ClientApplicationDto> declineOffer(@AuthenticationPrincipal User user, @PathVariable String id,
                                                             @RequestBody(required = false) Map<String, Object> body) {
        Application app = applicationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Заявка не найдена"));
        if (!app.getUserId().equals(user.getId())) {
            return ResponseEntity.status(403).body(null);
        }
        String reason = body != null ? (String) body.getOrDefault("reason", "") : "";
        Application updated = pipelineService.declineOffer(id, reason, Instant.now());
        return ResponseEntity.ok(toClientApplicationDto(updated));
    }

    @PostMapping("/{id}/signing/code")
    public ResponseEntity<SigningCodeResponse> signingCode(@AuthenticationPrincipal User user, @PathVariable String id) {
        Application app = applicationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Заявка не найдена"));
        if (!app.getUserId().equals(user.getId())) {
            return ResponseEntity.status(403).body(null);
        }
        // Generate a demo code
        String code = String.format("%04d", (int) (Math.random() * 10000));
        return ResponseEntity.ok(SigningCodeResponse.builder()
                .phoneMask("****" + user.getLogin().substring(Math.max(0, user.getLogin().length() - 4)))
                .demoCode(code)
                .build());
    }

    @PostMapping("/{id}/signing/confirm")
    public ResponseEntity<ClientApplicationDto> confirmSigning(@AuthenticationPrincipal User user, @PathVariable String id,
                                                               @RequestBody(required = false) Map<String, Object> body) {
        Application app = applicationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Заявка не найдена"));
        if (!app.getUserId().equals(user.getId())) {
            return ResponseEntity.status(403).body(null);
        }
        Application updated = pipelineService.confirmSigning(id, "", Instant.now());
        return ResponseEntity.ok(toClientApplicationDto(updated));
    }

    // --- Helpers ---

    private ApplicationSummaryDto toSummaryDto(Application app) {
        return ApplicationSummaryDto.builder()
                .id(app.getId())
                .number(app.getNumber())
                .status(app.getStatus().name())
                .product(app.getProduct())
                .amount(app.getAmount())
                .termMonths(app.getTermMonths())
                .createdAt(app.getCreatedAt().toString())
                .updatedAt(app.getUpdatedAt().toString())
                .build();
    }

    private ClientApplicationDto toClientApplicationDto(Application app) {
        return ClientApplicationDto.builder()
                .id(app.getId())
                .number(app.getNumber())
                .status(app.getStatus().name())
                .product(app.getProduct())
                .amount(app.getAmount())
                .termMonths(app.getTermMonths())
                .purpose(app.getPurpose())
                .createdAt(app.getCreatedAt().toString())
                .submittedAt(app.getSubmittedAt() != null ? app.getSubmittedAt().toString() : null)
                .updatedAt(app.getUpdatedAt().toString())
                .formJson(app.getFormJson())
                .enrichmentJson(app.getEnrichmentJson())
                .scoringJson(app.getScoringJson())
                .decisionJson(app.getDecisionJson())
                .signingJson(app.getSigningJson())
                .history(List.of())
                .stageEta(null)
                .build();
    }
}
