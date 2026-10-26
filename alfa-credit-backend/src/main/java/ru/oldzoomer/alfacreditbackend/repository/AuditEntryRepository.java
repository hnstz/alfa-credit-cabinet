package ru.oldzoomer.alfacreditbackend.repository;

import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;
import ru.oldzoomer.alfacreditbackend.entity.AuditEntry;

import java.util.List;

@Repository
public interface AuditEntryRepository extends CrudRepository<AuditEntry, String> {

    List<AuditEntry> findByApplicationIdOrderByAtDesc(String applicationId);
}
