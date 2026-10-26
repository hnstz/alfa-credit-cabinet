package ru.oldzoomer.alfacreditbackend.controller;

import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.oldzoomer.alfacreditbackend.dto.BankApplicationDto;
import ru.oldzoomer.alfacreditbackend.dto.BankDecisionRequest;
import ru.oldzoomer.alfacreditbackend.dto.BankQueueItemDto;
import ru.oldzoomer.alfacreditbackend.dto.BankQueueResponseDto;
import ru.oldzoomer.alfacreditbackend.entity.Application;
import ru.oldzoomer.alfacreditbackend.entity.ApplicationStatus;
import ru.oldzoomer.alfacreditbackend.entity.User;
import ru.oldzoomer.alfacreditbackend.repository.ApplicationRepository;
import ru.oldzoomer.alfacreditbackend.service.ApplicationPipelineService;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@RestController
@RequestMapping("/api/bank")
public class BankController {

    private final ApplicationRepository applicationRepository;
    private final ApplicationPipelineService pipelineService;

    public BankController(ApplicationRepository applicationRepository,
                          ApplicationPipelineService pipelineService) {
        this.applicationRepository = applicationRepository;
        this.pipelineService = pipelineService;
    }

    @GetMapping("/applications")
    public ResponseEntity<BankQueueResponseDto> list(
            @AuthenticationPrincipal User user,
            @RequestParam(defaultValue = "ALL") String status,
            @RequestParam(required = false) List<String> risk,
            @RequestParam(required = false) Integer minAmount,
            @RequestParam(required = false) Integer maxAmount,
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "submittedAt:desc") String sort) {

        List<Application> all = applicationRepository.findAllExcludingDrafts(Sort.by(Sort.Direction.DESC, "updatedAt"));

        // Filter by status group
        Set<ApplicationStatus> statusFilter = switch (status) {
            case "ACTION" -> Set.of(ApplicationStatus.UNDER_REVIEW);
            case "PIPELINE" -> Set.of(ApplicationStatus.SUBMITTED, ApplicationStatus.VALIDATION,
                    ApplicationStatus.ENRICHMENT, ApplicationStatus.SCORING, ApplicationStatus.NEEDS_INFO);
            case "DECIDED" -> Set.of(ApplicationStatus.APPROVED, ApplicationStatus.COUNTER_OFFER,
                    ApplicationStatus.OFFER_ACCEPTED, ApplicationStatus.SIGNING, ApplicationStatus.SIGNED);
            case "CLOSED" -> Set.of(ApplicationStatus.REJECTED, ApplicationStatus.OFFER_DECLINED,
                    ApplicationStatus.DISBURSED, ApplicationStatus.CANCELLED, ApplicationStatus.EXPIRED);
            default -> null; // no filter
        };
        if (statusFilter != null) {
            all = all.stream().filter(a -> statusFilter.contains(a.getStatus())).toList();
        }

        // Filter by query
        if (!q.isBlank()) {
            String lowerQ = q.toLowerCase();
            all = all.stream().filter(a ->
                    a.getNumber().toLowerCase().contains(lowerQ)).toList();
        }

        // Sort in memory
        String[] sortParts = sort.split(":");
        String sortKey = sortParts[0];
        boolean asc = sortParts.length > 1 && "asc".equalsIgnoreCase(sortParts[1]);
        all.sort((a, b) -> {
            int cmp = switch (sortKey) {
                case "amount" ->
                        Long.compare(a.getAmount() != null ? a.getAmount() : 0L, b.getAmount() != null ? b.getAmount() : 0L);
                default -> a.getUpdatedAt().compareTo(b.getUpdatedAt());
            };
            return asc ? cmp : -cmp;
        });

        // Convert to DTOs
        List<BankQueueItemDto> items = all.stream().map(this::toQueueItem).toList();

        // Counters
        long awaitingDecision = all.stream().filter(a -> a.getStatus() == ApplicationStatus.UNDER_REVIEW).count();
        long inPipeline = all.stream().filter(a ->
                Set.of(ApplicationStatus.SUBMITTED, ApplicationStatus.VALIDATION,
                                ApplicationStatus.ENRICHMENT, ApplicationStatus.SCORING, ApplicationStatus.NEEDS_INFO)
                        .contains(a.getStatus())).count();

        BankQueueResponseDto.QueueCountersDto counters = BankQueueResponseDto.QueueCountersDto.builder()
                .awaitingDecision((int) awaitingDecision)
                .inPipeline((int) inPipeline)
                .decidedToday(0)
                .overrideRate(0.0)
                .build();

        return ResponseEntity.ok(BankQueueResponseDto.builder()
                .items(items)
                .total(items.size())
                .counters(counters)
                .build());
    }

    @GetMapping("/applications/{id}")
    public ResponseEntity<BankApplicationDto> get(@AuthenticationPrincipal User user, @PathVariable String id) {
        Optional<Application> opt = applicationRepository.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.status(404).body(null);
        }
        return ResponseEntity.ok(toBankApplicationDto(opt.get()));
    }

    @PostMapping("/applications/{id}/decision")
    public ResponseEntity<BankApplicationDto> decision(@AuthenticationPrincipal User user, @PathVariable String id,
                                                       @Valid @RequestBody BankDecisionRequest request) {
        Optional<Application> opt = applicationRepository.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.status(404).body(null);
        }
        Application app = opt.get();
        if (app.getStatus() != ApplicationStatus.UNDER_REVIEW) {
            return ResponseEntity.status(409).body(null);
        }

        Application updated = pipelineService.makeDecision(
                id, request.getDecision(), request.getTerms(),
                request.getRejectReason(), request.getComment(), Instant.now());

        return ResponseEntity.ok(toBankApplicationDto(updated));
    }

    // --- Helpers ---

    private BankQueueItemDto toQueueItem(Application app) {
        return BankQueueItemDto.builder()
                .id(app.getId())
                .number(app.getNumber())
                .status(app.getStatus().name())
                .companyName("Компания") // Would need JOIN to get company name
                .inn("")
                .legalForm("")
                .product(app.getProduct())
                .amount(app.getAmount())
                .termMonths(app.getTermMonths())
                .submittedAt(app.getSubmittedAt() != null ? app.getSubmittedAt().toString() : app.getCreatedAt().toString())
                .updatedAt(app.getUpdatedAt().toString())
                .score(null)
                .riskLevel(null)
                .recommendation(null)
                .build();
    }

    private BankApplicationDto toBankApplicationDto(Application app) {
        return BankApplicationDto.builder()
                .id(app.getId())
                .number(app.getNumber())
                .status(app.getStatus().name())
                .product(app.getProduct())
                .createdAt(app.getCreatedAt().toString())
                .submittedAt(app.getSubmittedAt() != null ? app.getSubmittedAt().toString() : null)
                .updatedAt(app.getUpdatedAt().toString())
                .formJson(app.getFormJson())
                .enrichmentJson(app.getEnrichmentJson())
                .scoringJson(app.getScoringJson())
                .decisionJson(app.getDecisionJson())
                .audit(List.of())
                .build();
    }
}
